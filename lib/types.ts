import type { Language } from './i18n';

// ---------------------------------------------------------------------------
// Shared types used by the form, the live preview, and the API routes.
// Keeping these in one place means the client and server always agree on
// the shape of an invoice.
// ---------------------------------------------------------------------------

export interface InvoiceFormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  serviceDate: string; // YYYY-MM-DD
  description: string;
  hours: number;
  rate: number;
  materialCost: number;
  taxPreset: '0' | '5' | '10' | 'custom';
  taxRate: number; // percent, e.g. 5 for 5%
}

export const emptyInvoice: InvoiceFormData = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  serviceDate: '',
  description: '',
  hours: 0,
  rate: 0,
  materialCost: 0,
  taxPreset: '0',
  taxRate: 0,
};

// Fields the voice pipeline is allowed to autofill (Sections 3 & 4 only).
export interface ExtractedInvoiceFields {
  description: string | null;
  serviceDate: string | null; // YYYY-MM-DD or null
  hoursWorked: number | null;
  hourlyRate: number | null;
  materialCost: number | null;
}

export interface TranscribeResponse {
  transcript: string;
}

export interface ExtractResponse {
  fields: ExtractedInvoiceFields;
  rawTranscript: string;
}

export interface GeneratePdfRequest {
  data: InvoiceFormData;
  totals: Totals;
  invoiceId: string;
  generatedOn: string;
  lang?: Language;
}

export interface Totals {
  laborSubtotal: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}
