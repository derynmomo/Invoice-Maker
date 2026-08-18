'use client';

import clsx from 'clsx';
import { currency, formatDateLong } from '@/lib/calculations';
import { useLanguage } from './LanguageContext';
import { t } from '@/lib/i18n';
import type { InvoiceFormData, Totals } from '@/lib/types';

export type SmsState = 'idle' | 'sending' | 'sent' | 'error';

interface InvoicePreviewProps {
  data: InvoiceFormData;
  totals: Totals;
  invoiceId: string;
  generatedOn: string;
  smsState: SmsState;
  onSendSms: () => void;
  canSendSms: boolean;
}

export default function InvoicePreview({
  data,
  totals,
  invoiceId,
  generatedOn,
  smsState,
  onSendSms,
  canSendSms,
}: InvoicePreviewProps) {
  const { language } = useLanguage();
  const fullName = (data.firstName + ' ' + data.lastName).trim() || t(language, 'clientFallback');
  const taxLabel = t(language, 'taxRowLabel', {
    pct: data.taxRate % 1 === 0 ? data.taxRate.toFixed(0) : data.taxRate.toFixed(2),
  });

  return (
    <div>
      <div id="invoice-preview" className="invoice-paper rounded-[10px] overflow-hidden flex">
        {/* Perforated stub */}
        <div className="stub-perforation hidden sm:block shrink-0" />
        <div className="hidden sm:flex flex-col items-center justify-between py-8 px-3 shrink-0 bg-ink">
          <span
            className="font-mono text-[9px] text-paper/60 tracking-widest"
            style={{ writingMode: 'vertical-rl' }}
          >
            LEDGER · INVOICE
          </span>
          <span className="font-mono text-[11px] text-paper tracking-wide" style={{ writingMode: 'vertical-rl' }}>
            {invoiceId || '—'}
          </span>
        </div>

        {/* Invoice body */}
        <div className="flex-1 p-7 sm:p-10">
          {/* Letterhead */}
          <div className="flex items-start justify-between pb-6 mb-6 border-b-2 border-ink">
            <div>
              <p className="font-display text-2xl font-semibold tracking-tight">{t(language, 'invoiceTitle')}</p>
              <p className="font-mono text-[11px] text-slate-ink mt-1">
                {t(language, 'issuedPrefix', { date: formatDateLong(generatedOn, language) })}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[11px] text-slate-ink uppercase tracking-wide">{t(language, 'invoiceNo')}</p>
              <p className="font-mono text-lg font-semibold tabular text-ledger">{invoiceId || '—'}</p>
            </div>
          </div>

          {/* Bill to / service date */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate-ink mb-1.5">{t(language, 'billedTo')}</p>
              <p className="font-display font-semibold text-[16px]">{fullName}</p>
              <p className="text-[13px] text-slate-ink mt-0.5">{data.email || '—'}</p>
              {data.phone && <p className="text-[13px] text-slate-ink">{data.phone}</p>}
            </div>
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate-ink mb-1.5">{t(language, 'dateOfService')}</p>
              <p className="font-mono text-[14px] tabular">{formatDateLong(data.serviceDate, language)}</p>
            </div>
          </div>

          {/* Description */}
          <div className="mb-8">
            <p className="font-mono text-[10px] uppercase tracking-wide text-slate-ink mb-1.5">{t(language, 'workPerformed')}</p>
            <p className="text-[14px] leading-relaxed text-ink/90 whitespace-pre-line">
              {data.description.trim() || t(language, 'noDescription')}
            </p>
          </div>

          {/* Line items */}
          <table className="w-full text-[13.5px] mb-2">
            <thead>
              <tr className="border-b border-rule font-mono text-[10.5px] uppercase tracking-wide text-slate-ink">
                <th className="text-left font-medium py-2">{t(language, 'item')}</th>
                <th className="text-right font-medium py-2">{t(language, 'qty')}</th>
                <th className="text-right font-medium py-2">{t(language, 'rateHeader')}</th>
                <th className="text-right font-medium py-2">{t(language, 'amount')}</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular">
              <tr className="border-b border-rule/70">
                <td className="py-2.5">{t(language, 'labor')}</td>
                <td className="text-right py-2.5">
                  {(data.hours || 0).toFixed(2)} {t(language, 'hrsUnit')}
                </td>
                <td className="text-right py-2.5">{currency(data.rate, language)}</td>
                <td className="text-right py-2.5">{currency(totals.laborSubtotal, language)}</td>
              </tr>
              <tr className="border-b border-rule/70">
                <td className="py-2.5">{t(language, 'materials')}</td>
                <td className="text-right py-2.5">—</td>
                <td className="text-right py-2.5">—</td>
                <td className="text-right py-2.5">{currency(data.materialCost, language)}</td>
              </tr>
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-full max-w-[240px] font-mono text-[13.5px]">
              <div className="flex justify-between py-1.5">
                <span className="text-slate-ink">{t(language, 'subtotal')}</span>
                <span className="tabular">{currency(totals.subtotal, language)}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-ink">{taxLabel}</span>
                <span className="tabular">{currency(totals.taxAmount, language)}</span>
              </div>
              <div className="flex justify-between items-baseline pt-3 mt-2 border-t-2 border-ink">
                <span className="font-display font-semibold text-[15px]">{t(language, 'totalDue')}</span>
                <span className="font-display font-semibold text-2xl tabular text-ledger">
                  {currency(totals.total, language)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-10 pt-5 border-t border-rule flex items-center justify-between">
            <p className="text-[11px] text-slate-ink">{t(language, 'footerThanks')}</p>
            <p className="font-mono text-[10px] text-slate-ink">
              {t(language, 'generatedPrefix', { date: formatDateLong(generatedOn, language) })}
            </p>
          </div>
        </div>
      </div>

      {/* Send via SMS — primary action, sits just below the invoice */}
      <div className="no-print mt-4">
        <button
          type="button"
          onClick={onSendSms}
          disabled={!canSendSms || smsState === 'sending'}
          className={clsx(
            'w-full flex items-center justify-center gap-2.5 py-3.5 rounded-[8px] font-display font-semibold text-[14.5px] transition-colors',
            smsState === 'sent'
              ? 'bg-ledger/15 text-ledger-dark border border-ledger'
              : 'bg-ink text-paper hover:bg-ink/90',
            (!canSendSms || smsState === 'sending') && 'opacity-50 cursor-not-allowed'
          )}
        >
          {smsState === 'sending' && (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          )}
          {smsState === 'sent'
            ? t(language, 'smsSentAgain')
            : smsState === 'sending'
              ? t(language, 'smsSending')
              : t(language, 'sendViaSms')}
        </button>
        {!canSendSms && <p className="text-[11px] text-slate-ink mt-2 text-center">{t(language, 'smsDisabledHelper')}</p>}
      </div>
    </div>
  );
}