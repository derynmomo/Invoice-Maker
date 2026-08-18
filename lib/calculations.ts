import { InvoiceFormData, Totals } from './types';
import type { Language } from './i18n';

/**
 * Coerces any input into a safe, non-negative finite number.
 * This is the single choke point that guarantees the app never
 * renders NaN / Infinity / negative values, no matter what the
 * form, the voice pipeline, or a stray paste event sends in.
 */
export function safeNumber(value: unknown): number {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (typeof n !== 'number' || Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

export function currency(value: unknown, lang: Language = 'en'): string {
  const n = safeNumber(value);
  const locale = lang === 'fr' ? 'fr-CA' : 'en-US';
  const iso = lang === 'fr' ? 'CAD' : 'USD';
  return n.toLocaleString(locale, { style: 'currency', currency: iso });
}

export function computeTotals(data: Pick<InvoiceFormData, 'hours' | 'rate' | 'materialCost' | 'taxRate'>): Totals {
  const hours = safeNumber(data.hours);
  const rate = safeNumber(data.rate);
  const materialCost = safeNumber(data.materialCost);
  const taxRate = safeNumber(data.taxRate);

  const laborSubtotal = hours * rate;
  const subtotal = laborSubtotal + materialCost;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  return { laborSubtotal, subtotal, taxAmount, total };
}

/** YYYY-MM-DD for the user's local date (avoids UTC off-by-one). */
export function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Formats an ISO date (YYYY-MM-DD) as "Aug 6, 2026" or "6 août 2026" without timezone drift. */
export function formatDateLong(dateStr: string | null | undefined, lang: Language = 'en'): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '—';
  const [y, m, d] = parts.map((p) => parseInt(p, 10));
  const date = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Generates a readable, collision-resistant ID such as
 * INV-20260809-K7M4Q2PX9R5T.
 *
 * The date makes invoices easy to sort by eye. The 12-character random
 * suffix uses an ambiguity-free alphabet and enough entropy for many users
 * to create invoices concurrently without relying on a shared counter.
 */
export function generateInvoiceId(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const randomValues = new Uint8Array(12);

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    for (let index = 0; index < randomValues.length; index += 1) {
      randomValues[index] = Math.floor(Math.random() * 256);
    }
  }

  const suffix = Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
  return `INV-${yyyy}${mm}${dd}-${suffix}`;
}

/** Validates E.164-ish phone numbers loosely (allows spaces, dashes, parens, leading +). */
export function isValidPhone(value: string): boolean {
  const digits = value.replace(/[^\d]/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Normalizes a phone number to E.164 for the SMS API (defaults to +1 if no country code given). */
export function toE164(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/[^\d]/g, '');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length === 10) return '+1' + digits; // assume NANP if no country code
  return '+' + digits;
}
