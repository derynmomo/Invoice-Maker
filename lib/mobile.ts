// Mobile / offline helpers for the Capacitor build.
//
// The static export that ships in the iOS/Android app has no Next.js server,
// so the server API route (/api/generate-pdf) does not exist on device. These
// helpers generate the PDF in the browser (pdf-lib works on the client) and
// hand it to the OS share sheet via @capacitor/share — no Twilio, no SMS
// backend, no server required on the phone.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { generateInvoicePdf } from './generateInvoicePdf';
import type { GeneratePdfRequest } from './types';

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform();
}

function pdfFilename(invoiceId: string): string {
  return `${invoiceId.replace(/[^a-zA-Z0-9-]/g, '') || 'invoice'}.pdf`;
}

export async function buildPdfBlob(request: GeneratePdfRequest): Promise<Blob> {
  const bytes = await generateInvoicePdf(request);
  return new Blob([bytes], { type: 'application/pdf' });
}

export async function downloadPdfClient(request: GeneratePdfRequest): Promise<void> {
  const blob = await buildPdfBlob(request);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = pdfFilename(request.invoiceId);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Shares the PDF through the native OS share sheet in the Capacitor app.
 * The PDF is written to a temp (cache) file first — iOS/Android share sheets
 * need a real file URL, not a blob.
 */
export async function sharePdfClient(request: GeneratePdfRequest): Promise<void> {
  const blob = await buildPdfBlob(request);
  const base64 = await blobToBase64(blob);
  const result = await Filesystem.writeFile({
    path: pdfFilename(request.invoiceId),
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({
    files: [result.uri],
    title: pdfFilename(request.invoiceId),
    dialogTitle: pdfFilename(request.invoiceId),
  });
}

/**
 * Shares the PDF via the Web Share API. Returns:
 *   'shared'    – the OS share sheet was opened on the web
 *   'cancelled' – the user dismissed the sheet (no fallback needed)
 *   'unavailable' – the Web Share API / file sharing isn't supported
 */
export async function sharePdfWeb(request: GeneratePdfRequest): Promise<'shared' | 'cancelled' | 'unavailable'> {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') {
    return 'unavailable';
  }

  const blob = await buildPdfBlob(request);
  const file = new File([blob], pdfFilename(request.invoiceId), { type: 'application/pdf' });
  if (!navigator.canShare({ files: [file] })) return 'unavailable';

  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (err: any) {
    // AbortError = user closed the sheet; treat as a no-op.
    if (err?.name === 'AbortError') return 'cancelled';
    return 'unavailable';
  }
}

export function canSharePdfWeb(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function'
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result.split(',')[1] ?? '');
      } else {
        reject(new Error('Could not read the PDF as base64.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the PDF.'));
    reader.readAsDataURL(blob);
  });
}