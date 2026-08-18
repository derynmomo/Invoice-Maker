// Mobile / offline helpers for the Capacitor build.
//
// The static export that ships in the iOS/Android app has no Next.js server,
// so the server API routes (/api/generate-pdf, /api/send-sms) do not exist on
// device. These helpers generate the PDF in the browser (pdf-lib works on the
// client) and hand the invoice summary to the OS share sheet so the user can
// text it from Messages / SMS — no Twilio account required on the phone.
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { generateInvoicePdf } from './generateInvoicePdf';
import { t, type Language } from './i18n';
import type { GeneratePdfRequest } from './types';

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform();
}

export async function downloadPdfClient(request: GeneratePdfRequest): Promise<void> {
  const bytes = await generateInvoicePdf(request);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const filename = `${request.invoiceId.replace(/[^a-zA-Z0-9-]/g, '') || 'invoice'}.pdf`;
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function canShareInvoice(): Promise<boolean> {
  try {
    const result = await Share.canShare();
    return result.value;
  } catch {
    return false;
  }
}

export async function shareInvoiceText(options: {
  clientName: string;
  invoiceId: string;
  workSummary: string;
  totalDue: string;
  lang?: Language;
}): Promise<void> {
  const lang = options.lang ?? 'en';
  const summary = (options.workSummary || t(lang, 'servicesRendered')).trim();
  const trimmed = summary.length > 140 ? summary.slice(0, 137) + '…' : summary;
  const text = [
    t(lang, 'shareHi', { client: options.clientName, invoiceId: options.invoiceId }),
    t(lang, 'shareWork', { summary: trimmed }),
    t(lang, 'shareTotalDue', { due: options.totalDue }),
  ].join('\n');

  await Share.share({
    title: t(lang, 'shareTitle', { invoiceId: options.invoiceId }),
    text,
    dialogTitle: t(lang, 'shareDialogTitle'),
  });
}