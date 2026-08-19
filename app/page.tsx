'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InvoiceForm from '@/components/InvoiceForm';
import InvoicePreview, { SmsState } from '@/components/InvoicePreview';
import ToastContainer, { ToastMessage } from '@/components/Toast';
import { LanguageProvider, useLanguage } from '@/components/LanguageContext';
import { t } from '@/lib/i18n';
import {
  computeTotals,
  currency,
  generateInvoiceId,
  isValidEmail,
  isValidPhone,
  todayISO,
} from '@/lib/calculations';
import { canShareInvoice, downloadPdfClient, isNativeApp, shareInvoiceText } from '@/lib/mobile';
import { emptyInvoice, type ExtractedInvoiceFields, type InvoiceFormData, type SendSmsResponse } from '@/lib/types';

type FieldErrors = Partial<Record<keyof InvoiceFormData, string>>;

export default function Home() {
  return (
    <LanguageProvider>
      <HomeContent />
    </LanguageProvider>
  );
}

function HomeContent() {
  const { language, setLanguage } = useLanguage();
  const [data, setData] = useState<InvoiceFormData>({ ...emptyInvoice, serviceDate: todayISO() });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [autofilled, setAutofilled] = useState<Set<keyof InvoiceFormData>>(new Set());
  // Start blank on the server; the real random ID is generated client-side
  // in the effect below. Generating it during initial render would produce
  // a different value on the server vs. the browser and trigger a React
  // hydration mismatch.
  const [invoiceId, setInvoiceId] = useState('');
  const [generatedOn] = useState(todayISO());

  useEffect(() => {
    setInvoiceId(generateInvoiceId());
    if (!isNativeApp() && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // PWA install is optional — ignore registration failures.
      });
    }
  }, []);
  const [smsState, setSmsState] = useState<SmsState>('idle');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [pdfState, setPdfState] = useState<'idle' | 'generating'>('idle');
  const toastIdRef = useRef(0);
  const autofillTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const totals = useMemo(() => computeTotals(data), [data]);

  // -------------------------------------------------------------------
  // Toasts
  // -------------------------------------------------------------------
  const pushToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // -------------------------------------------------------------------
  // Form state
  // -------------------------------------------------------------------
  const handleChange = useCallback((patch: Partial<InvoiceFormData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const validateField = useCallback(
    (field: keyof InvoiceFormData, value: string): string | undefined => {
      switch (field) {
        case 'firstName':
          return value.trim() ? undefined : t(language, 'firstNameRequired');
        case 'lastName':
          return value.trim() ? undefined : t(language, 'lastNameRequired');
        case 'email':
          return !value.trim() || isValidEmail(value) ? undefined : t(language, 'emailInvalid');
        case 'phone':
          return isValidPhone(value) ? undefined : t(language, 'phoneInvalid');
        default:
          return undefined;
      }
    },
    [language]
  );

  const handleBlurField = useCallback(
    (field: keyof InvoiceFormData) => {
      const value = String(data[field] ?? '');
      const message = validateField(field, value);
      setErrors((prev) => ({ ...prev, [field]: message }));
    },
    [data, validateField]
  );

  function validateForPdf(): boolean {
    const next: FieldErrors = {
      firstName: validateField('firstName', data.firstName),
      lastName: validateField('lastName', data.lastName),
    };
    setErrors((prev) => ({ ...prev, ...next }));
    return !next.firstName && !next.lastName;
  }

  function validateForSms(): boolean {
    const next: FieldErrors = {
      firstName: validateField('firstName', data.firstName),
      lastName: validateField('lastName', data.lastName),
      phone: validateField('phone', data.phone),
    };
    setErrors((prev) => ({ ...prev, ...next }));
    return !next.firstName && !next.lastName && !next.phone;
  }

  const canSendSms = data.firstName.trim().length > 0 && data.lastName.trim().length > 0 && isValidPhone(data.phone);

  // -------------------------------------------------------------------
  // Voice autofill
  // -------------------------------------------------------------------
  const flashAutofilled = useCallback((fields: Array<keyof InvoiceFormData>) => {
    setAutofilled((prev) => {
      const next = new Set(prev);
      fields.forEach((f) => next.add(f));
      return next;
    });
    fields.forEach((f) => {
      const existing = autofillTimers.current.get(f);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setAutofilled((prev) => {
          const next = new Set(prev);
          next.delete(f);
          return next;
        });
      }, 1500);
      autofillTimers.current.set(f, timer);
    });
  }, []);

  const handleVoiceExtracted = useCallback(
    (fields: ExtractedInvoiceFields, _transcript: string) => {
      const patch: Partial<InvoiceFormData> = {};
      const touched: Array<keyof InvoiceFormData> = [];

      if (fields.description) {
        patch.description = fields.description;
        touched.push('description');
      }
      if (fields.serviceDate) {
        patch.serviceDate = fields.serviceDate;
        touched.push('serviceDate');
      }
      if (typeof fields.hoursWorked === 'number') {
        patch.hours = Math.max(0, fields.hoursWorked);
        touched.push('hours');
      }
      if (typeof fields.hourlyRate === 'number') {
        patch.rate = Math.max(0, fields.hourlyRate);
        touched.push('rate');
      }
      if (typeof fields.materialCost === 'number') {
        patch.materialCost = Math.max(0, fields.materialCost);
        touched.push('materialCost');
      }

      if (touched.length === 0) {
        pushToast(t(language, 'toastVoiceNothing'), 'error');
        return;
      }

      setData((prev) => ({ ...prev, ...patch }));
      flashAutofilled(touched);
      pushToast(
        t(language, touched.length > 1 ? 'toastAutofilledMany' : 'toastAutofilledOne', { count: touched.length }),
        'success'
      );
    },
    [flashAutofilled, pushToast, language]
  );

  const handleVoiceError = useCallback(
    (message: string) => {
      pushToast(message, 'error');
    },
    [pushToast]
  );

  // -------------------------------------------------------------------
  // Actions: clear, export, print, SMS
  // -------------------------------------------------------------------
  function handleClearForm() {
    setData({ ...emptyInvoice, serviceDate: todayISO() });
    setErrors({});
    setAutofilled(new Set());
    setInvoiceId(generateInvoiceId());
    setSmsState('idle');
    pushToast(t(language, 'toastFormCleared'), 'info');
  }

  function handleExportJson() {
    const payload = {
      invoiceId,
      generatedOn,
      client: { firstName: data.firstName, lastName: data.lastName, phone: data.phone, email: data.email },
      service: { date: data.serviceDate, description: data.description },
      financials: {
        hours: data.hours,
        hourlyRate: data.rate,
        materialCost: data.materialCost,
        taxRatePercent: data.taxRate,
        ...totals,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceId.replace('#', '')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleDownloadPdf() {
    if (!validateForPdf()) {
      pushToast(t(language, 'toastPdfNeedsName'), 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setPdfState('generating');
    try {
      const pdfRequest = { data, totals, invoiceId, generatedOn, lang: language };
      if (isNativeApp()) {
        await downloadPdfClient(pdfRequest);
      } else {
        // On the hosted web app the server generates the PDF. If the server
        // route is unreachable (e.g. the static export used by the app),
        // fall back to generating it right in the browser.
        try {
          const res = await fetch('/api/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pdfRequest),
          });
          if (!res.ok) {
            const errorBody = await res.json().catch(() => null);
            throw new Error(errorBody?.error || t(language, 'toastPdfError'));
          }

          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `${invoiceId.replace('#', '') || t(language, 'filenameInvoice')}.pdf`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
          await downloadPdfClient(pdfRequest);
        }
      }
      pushToast(t(language, 'toastPdfDownloaded'), 'success');
    } catch (error: any) {
      pushToast(error?.message || t(language, 'toastPdfRetry'), 'error');
    } finally {
      setPdfState('idle');
    }
  }

  async function handleSendSms() {
    if (!validateForSms()) {
      pushToast(t(language, 'toastSmsNeedsFields'), 'error');
      return;
    }

    setSmsState('sending');
    const clientName = `${data.firstName} ${data.lastName}`.trim();
    const workSummary = data.description || t(language, 'servicesRendered');
    const totalDueText = currency(totals.total, language);
    const shareOptions = { clientName, invoiceId, workSummary, totalDue: totalDueText, lang: language };
    const invoiceUrl = process.env.NEXT_PUBLIC_INVOICE_BASE_URL
      ? `${process.env.NEXT_PUBLIC_INVOICE_BASE_URL.replace(/\/+$/, '')}/invoice/${invoiceId}`
      : undefined;

    try {
      if (isNativeApp()) {
        // In the app there is no Twilio backend — open the OS share sheet
        // (Messages / SMS) with the invoice summary pre-filled.
        await shareInvoiceText(shareOptions);
        setSmsState('sent');
        pushToast(t(language, 'toastShareReady'), 'success');
        setTimeout(() => setSmsState('idle'), 4000);
        return;
      }

      try {
        const res = await fetch('/api/send-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toPhoneNumber: data.phone,
            clientName,
            workSummary,
            totalDue: totals.total,
            invoiceId,
            invoiceUrl,
            lang: language,
          }),
        });
        const json: SendSmsResponse = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || t(language, 'toastSmsFailed'));
        }

        setSmsState('sent');
        pushToast(t(language, 'toastSmsSentTo', { phone: data.phone }), 'success');
        setTimeout(() => setSmsState('idle'), 4000);
        return;
      } catch (serverError) {
        // No Twilio backend here (e.g. static export on a phone) — hand off
        // to the OS share sheet instead of failing.
        if (await canShareInvoice()) {
          await shareInvoiceText(shareOptions);
          setSmsState('sent');
          pushToast(t(language, 'toastShareReady'), 'success');
          setTimeout(() => setSmsState('idle'), 4000);
          return;
        }
        throw serverError;
      }
    } catch (err: any) {
      setSmsState('error');
      pushToast(err?.message || t(language, 'toastSmsRetry'), 'error');
      setTimeout(() => setSmsState('idle'), 2500);
    }
  }

  const languageButtonClass = (active: boolean) =>
    `font-mono text-[10px] tracking-wide px-2 py-1 transition-colors ${
      active ? 'bg-ink text-paper' : 'text-slate-ink hover:text-ink'
    }`;

  return (
    <>
      {/* ============ TOP BAR ============ */}
      <header className="no-print sticky top-0 z-30 bg-canvas/90 backdrop-blur border-b border-rule">
        <div className="pt-[env(safe-area-inset-top)]" aria-hidden="true" />
        <div className="max-w-[1400px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[6px] bg-ink flex items-center justify-center">
              <span className="font-mono text-paper text-xs font-semibold">§</span>
            </div>
            <div className="leading-tight hidden xs:block sm:block">
              <p className="font-display font-semibold text-[15px] tracking-tight">Ledger</p>
              <p className="font-mono text-[10px] text-slate-ink tracking-wide -mt-0.5">VOICE INVOICE MAKER</p>
            </div>
            <div
              className="flex items-center rounded-[4px] border border-rule overflow-hidden ml-1"
              role="group"
              aria-label="Language"
            >
              <button type="button" onClick={() => setLanguage('en')} className={languageButtonClass(language === 'en')}>
                EN
              </button>
              <button type="button" onClick={() => setLanguage('fr')} className={languageButtonClass(language === 'fr')}>
                FR
              </button>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={handleClearForm}
              className="font-mono text-[11px] uppercase tracking-wide px-3.5 py-2 rounded-[4px] border border-rule text-slate-ink hover:border-danger hover:text-danger transition-colors"
            >
              {t(language, 'clearForm')}
            </button>
            <button
              onClick={handleExportJson}
              className="font-mono text-[11px] uppercase tracking-wide px-3.5 py-2 rounded-[4px] border border-rule text-ink hover:border-ink transition-colors"
            >
              {t(language, 'exportJson')}
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={pdfState === 'generating'}
              className="bg-ledger hover:bg-ledger-dark text-paper font-mono text-[11px] uppercase tracking-wide px-4 py-2 rounded-[4px] transition-colors"
            >
              {pdfState === 'generating' ? t(language, 'generatingPdf') : t(language, 'downloadPdf')}
            </button>
          </div>
          {/* Mobile: compact icon-only actions */}
          <div className="flex sm:hidden items-center gap-1.5">
            <button
              onClick={handleClearForm}
              aria-label={t(language, 'clearFormAria')}
              className="font-mono text-[10px] uppercase px-2.5 py-2 rounded-[4px] border border-rule text-slate-ink"
            >
              {t(language, 'clear')}
            </button>
            <button
              onClick={handleExportJson}
              aria-label={t(language, 'exportJson')}
              className="font-mono text-[10px] uppercase px-2.5 py-2 rounded-[4px] border border-rule text-slate-ink"
            >
              {t(language, 'json')}
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={pdfState === 'generating'}
              aria-label={t(language, 'downloadPdfAria')}
              className="bg-ledger text-paper font-mono text-[10px] uppercase px-2.5 py-2 rounded-[4px]"
            >
              {t(language, 'pdf')}
            </button>
          </div>
        </div>
      </header>

      {/* ============ MAIN ============ */}
      <main className="max-w-[1400px] mx-auto px-5 sm:px-8 py-8 pb-24 lg:pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.05fr] gap-8 items-start">
          {/* LEFT: form */}
          <InvoiceForm
            data={data}
            errors={errors}
            autofilled={autofilled}
            onChange={handleChange}
            onBlurField={handleBlurField}
            onVoiceExtracted={handleVoiceExtracted}
            onVoiceError={handleVoiceError}
          />

          {/* RIGHT: live preview (desktop) */}
          <div className="hidden lg:block lg:sticky lg:top-24">
            <p className="no-print font-mono text-[10px] uppercase tracking-wider text-slate-ink mb-2.5 px-1">
              {t(language, 'livePreview')}
            </p>
            <InvoicePreview
              data={data}
              totals={totals}
              invoiceId={invoiceId}
              generatedOn={generatedOn}
              smsState={smsState}
              onSendSms={handleSendSms}
              canSendSms={canSendSms}
            />
          </div>
        </div>
      </main>

      {/* ============ MOBILE: floating sticky preview tab ============ */}
      <button
        onClick={() => setMobilePreviewOpen(true)}
        className="no-print lg:hidden fixed bottom-[calc(env(safe-area-inset-bottom)+20px)] right-5 z-40 bg-ink text-paper font-display font-semibold text-[13px] px-5 py-3 rounded-full shadow-lg flex items-center gap-2"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
        </svg>
        {t(language, 'previewInvoice')} · {currency(totals.total, language)}
      </button>

      {mobilePreviewOpen && (
        <div className="no-print lg:hidden fixed inset-0 z-50 bg-ink/40 flex flex-col justify-end">
          <div className="bg-canvas rounded-t-[16px] max-h-[90vh] overflow-y-auto p-5 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-slate-ink">{t(language, 'livePreview')}</p>
              <button
                onClick={() => setMobilePreviewOpen(false)}
                aria-label={t(language, 'closePreview')}
                className="font-mono text-lg text-slate-ink"
              >
                ×
              </button>
            </div>
            <InvoicePreview
              data={data}
              totals={totals}
              invoiceId={invoiceId}
              generatedOn={generatedOn}
              smsState={smsState}
              onSendSms={handleSendSms}
              canSendSms={canSendSms}
            />
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}