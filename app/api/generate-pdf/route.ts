import { NextRequest, NextResponse } from 'next/server';
import { generateInvoicePdf } from '@/lib/generateInvoicePdf';
import { safeNumber } from '@/lib/calculations';
import type { Language } from '@/lib/i18n';
import type { GeneratePdfRequest, InvoiceFormData, Totals } from '@/lib/types';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// AppSec hardening for the public PDF endpoint.
//   • request size cap        – reject oversized bodies before parsing
//   • field-level validation  – bound types/lengths before hitting pdf-lib
//   • in-memory rate limiting – mitigate abuse / resource-exhaustion (DoS)
// The app has no accounts/auth, so this is the app's primary server-side
// attack surface and the cheapest, highest-signal place to add controls.
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 100 * 1024; // 100 KB is far beyond any real invoice
const MAX_TEXT_LEN = 500; // client name, description, id, etc.
const MAX_RATE_WINDOW_MS = 60_000;
const MAX_RATE_REQUESTS = 30; // 30 PDFs / minute / IP is generous headroom

const MAX_TEXT_FIELDS: Array<keyof Pick<InvoiceFormData, 'firstName' | 'lastName' | 'phone' | 'email' | 'serviceDate' | 'description' | 'taxPreset'>> = [
  'firstName',
  'lastName',
  'phone',
  'email',
  'serviceDate',
  'description',
  'taxPreset',
];

const VALID_LANGS: Language[] = ['en', 'fr'];

// Simple sliding-window rate limiter keyed by client IP. In-memory is
// sufficient for a single-instance deploy; swap for a shared store
// (Redis/Vercel KV) if the app scales to multiple instances.
type SlidingWindow = { timestamps: number[] };
const rateBuckets = new Map<string, SlidingWindow>();

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Returns true when the request should be rejected for exceeding the rate limit. */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = rateBuckets.get(ip) ?? { timestamps: [] };
  // Drop timestamps older than the window so the map doesn't grow unbounded.
  window.timestamps = window.timestamps.filter((t) => now - t < MAX_RATE_WINDOW_MS);

  if (window.timestamps.length >= MAX_RATE_REQUESTS) {
    rateBuckets.set(ip, window);
    return true;
  }

  window.timestamps.push(now);
  rateBuckets.set(ip, window);
  return false;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Validates and normalizes the request body. Returns the typed request on
 * success, or a `{ error, message }` object on failure.
 */
function validateBody(raw: unknown): { ok: true; value: GeneratePdfRequest } | { ok: false; message: string } {
  if (!isRecord(raw)) return { ok: false, message: 'The request body must be a JSON object.' };

  const { data, totals, invoiceId, generatedOn, lang } = raw;

  // --- invoiceId -----------------------------------------------------------------
  if (!isString(invoiceId) || invoiceId.length === 0 || invoiceId.length > MAX_TEXT_LEN) {
    return { ok: false, message: 'The invoice id is missing or invalid.' };
  }

  // --- generatedOn ---------------------------------------------------------------
  if (!isString(generatedOn) || generatedOn.length > MAX_TEXT_LEN) {
    return { ok: false, message: 'The issue date is missing or invalid.' };
  }

  // --- lang (optional) -----------------------------------------------------------
  if (lang !== undefined && (typeof lang !== 'string' || !VALID_LANGS.includes(lang as Language))) {
    return { ok: false, message: 'The language is invalid.' };
  }

  // --- data ----------------------------------------------------------------------
  if (!isRecord(data)) return { ok: false, message: 'The invoice data is invalid.' };

  const textFields: Record<string, string> = {};
  for (const field of MAX_TEXT_FIELDS) {
    const v = data[field];
    if (v !== undefined && v !== null && typeof v !== 'string') {
      return { ok: false, message: `The '${field}' field has an invalid type.` };
    }
    const s = typeof v === 'string' ? v : '';
    if (s.length > MAX_TEXT_LEN) {
      return { ok: false, message: `The '${field}' field is too long.` };
    }
    textFields[field] = s;
  }

  // Numeric fields must be real JSON numbers. They are passed through
  // safeNumber (the app's existing choke point) so NaN, Infinity and huge
  // non-finite values are clamped before they can reach pdf-lib.
  const numericRaw: Record<string, unknown> = {
    hours: data.hours,
    rate: data.rate,
    materialCost: data.materialCost,
    taxRate: data.taxRate,
  };
  for (const key of Object.keys(numericRaw)) {
    const v = numericRaw[key];
    if (v !== undefined && v !== null && !isFiniteNumber(v)) {
      return { ok: false, message: `The '${key}' field has an invalid type.` };
    }
  }
  // Reject non-finite / absurd magnitudes that a user would never legitimately
  // enter, mitigating resource abuse of the PDF renderer.
  for (const key of Object.keys(numericRaw)) {
    const v = numericRaw[key];
    if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > 1_000_000_000)) {
      return { ok: false, message: `The '${key}' field is out of range.` };
    }
  }
  const numericData = {
    hours: safeNumber(numericRaw.hours),
    rate: safeNumber(numericRaw.rate),
    materialCost: safeNumber(numericRaw.materialCost),
    taxRate: safeNumber(numericRaw.taxRate),
  };

  const dataNormalized: InvoiceFormData = {
    firstName: textFields.firstName,
    lastName: textFields.lastName,
    phone: textFields.phone,
    email: textFields.email,
    serviceDate: textFields.serviceDate,
    description: textFields.description,
    taxPreset: textFields.taxPreset as InvoiceFormData['taxPreset'],
    ...numericData,
  };

  // --- totals --------------------------------------------------------------------
  if (!isRecord(totals)) return { ok: false, message: 'The invoice totals are invalid.' };
  const totalsRaw: Record<string, unknown> = {
    laborSubtotal: totals.laborSubtotal,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    total: totals.total,
  };
  const totalsNormalized: Totals = {
    laborSubtotal: safeNumber(totalsRaw.laborSubtotal),
    subtotal: safeNumber(totalsRaw.subtotal),
    taxAmount: safeNumber(totalsRaw.taxAmount),
    total: safeNumber(totalsRaw.total),
  };

  return {
    ok: true,
    value: {
      data: dataNormalized,
      totals: totalsNormalized,
      invoiceId,
      generatedOn,
      lang: (lang as Language | undefined) ?? 'en',
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    // --- rate limit ----------------------------------------------------------------
    if (isRateLimited(clientIp(req))) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // --- body size cap -------------------------------------------------------------
    const lengthHeader = req.headers.get('content-length');
    if (lengthHeader && Number(lengthHeader) > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'The request is too large.' }, { status: 413 });
    }

    const rawText = await req.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'The request is too large.' }, { status: 413 });
    }

    let raw: unknown;
    try {
      raw = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: 'The request body is not valid JSON.' }, { status: 400 });
    }

    const result = validateBody(raw);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    const pdfBytes = await generateInvoicePdf(result.value);
    const filename = `${result.value.invoiceId.replace(/[^a-zA-Z0-9-]/g, '') || 'invoice'}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[generate-pdf] error:', error);
    return NextResponse.json({ error: 'Could not generate the PDF. Please try again.' }, { status: 500 });
  }
}
