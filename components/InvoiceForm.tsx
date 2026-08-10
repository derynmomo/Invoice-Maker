'use client';

import { ChangeEvent } from 'react';
import clsx from 'clsx';
import Stepper from './Stepper';
import VoiceWidget from './VoiceWidget';
import type { ExtractedInvoiceFields, InvoiceFormData } from '@/lib/types';

interface InvoiceFormProps {
  data: InvoiceFormData;
  errors: Partial<Record<keyof InvoiceFormData, string>>;
  autofilled: Set<keyof InvoiceFormData>;
  onChange: (patch: Partial<InvoiceFormData>) => void;
  onBlurField: (field: keyof InvoiceFormData) => void;
  onVoiceExtracted: (fields: ExtractedInvoiceFields, transcript: string) => void;
  onVoiceError: (message: string) => void;
}

const TAX_PRESETS: Array<{ label: string; value: InvoiceFormData['taxPreset']; rate: number | null }> = [
  { label: '0%', value: '0', rate: 0 },
  { label: '5%', value: '5', rate: 5 },
  { label: '10%', value: '10', rate: 10 },
  { label: 'Custom', value: 'custom', rate: null },
];

export default function InvoiceForm({
  data,
  errors,
  autofilled,
  onChange,
  onBlurField,
  onVoiceExtracted,
  onVoiceError,
}: InvoiceFormProps) {
  const fieldClass = (field: keyof InvoiceFormData) =>
    clsx('w-full py-2 text-[15px] mt-1', autofilled.has(field) && 'field-autofilled');

  const handleText =
    (field: keyof InvoiceFormData) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ [field]: e.target.value } as Partial<InvoiceFormData>);

  const handleNumber = (field: keyof InvoiceFormData) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    onChange({ [field]: raw === '' ? 0 : parseFloat(raw) } as Partial<InvoiceFormData>);
  };

  const selectTaxPreset = (preset: (typeof TAX_PRESETS)[number]) => {
    if (preset.rate === null) {
      onChange({ taxPreset: 'custom' });
    } else {
      onChange({ taxPreset: preset.value, taxRate: preset.rate });
    }
  };

  return (
    <form className="bg-white/60 border border-rule rounded-[10px] p-6 sm:p-8 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto form-scroll no-print" noValidate>
      {/* Section 1: Client */}
      <fieldset className="mb-7">
        <legend className="section-index mb-3">01 — CLIENT INFORMATION</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label" htmlFor="firstName">First name *</label>
            <input
              required
              id="firstName"
              type="text"
              placeholder="Jordan"
              value={data.firstName}
              onChange={handleText('firstName')}
              onBlur={() => onBlurField('firstName')}
              className={fieldClass('firstName')}
            />
            {errors.firstName && <p className="text-[11px] text-danger mt-1">{errors.firstName}</p>}
          </div>
          <div>
            <label className="field-label" htmlFor="lastName">Last name *</label>
            <input
              required
              id="lastName"
              type="text"
              placeholder="Alvarez"
              value={data.lastName}
              onChange={handleText('lastName')}
              onBlur={() => onBlurField('lastName')}
              className={fieldClass('lastName')}
            />
            {errors.lastName && <p className="text-[11px] text-danger mt-1">{errors.lastName}</p>}
          </div>
        </div>
      </fieldset>

      {/* Section 2: Contact */}
      <fieldset className="mb-7">
        <legend className="section-index mb-3">02 — CONTACT INFORMATION</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label" htmlFor="phone">Phone (with country code) *</label>
            <input
              required
              id="phone"
              type="tel"
              placeholder="+1 514 555 0134"
              value={data.phone}
              onChange={handleText('phone')}
              onBlur={() => onBlurField('phone')}
              className={fieldClass('phone')}
            />
            {errors.phone && <p className="text-[11px] text-danger mt-1">{errors.phone}</p>}
            <p className="text-[10.5px] text-slate-ink mt-1">Required to send the invoice via SMS.</p>
          </div>
          <div>
            <label className="field-label" htmlFor="email">Email (optional)</label>
            <input
              required
              id="email"
              type="email"
              placeholder="jordan@email.com"
              value={data.email}
              onChange={handleText('email')}
              onBlur={() => onBlurField('email')}
              className={fieldClass('email')}
            />
            {errors.email && <p className="text-[11px] text-danger mt-1">{errors.email}</p>}
          </div>
        </div>
      </fieldset>

      {/* Voice input — sits above Sections 3 & 4 per spec */}
      <VoiceWidget onExtracted={onVoiceExtracted} onError={onVoiceError} />

      {/* Section 3: Service Details */}
      <fieldset className="mb-7">
        <legend className="section-index mb-3">03 — SERVICE DETAILS</legend>
        <div className="mb-4">
          <label className="field-label" htmlFor="serviceDate">Date of service</label>
          <input
            id="serviceDate"
            type="date"
            value={data.serviceDate}
            onChange={handleText('serviceDate')}
            className={clsx(fieldClass('serviceDate'), 'font-mono max-w-[200px]')}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="description">Description of work</label>
          <textarea
            id="description"
            rows={3}
            placeholder="Replaced kitchen faucet, resealed sink basin, tested for leaks."
            value={data.description}
            onChange={handleText('description')}
            className={clsx(fieldClass('description'), 'resize-none')}
          />
        </div>
      </fieldset>

      {/* Section 4: Financial Details */}
      <fieldset className="mb-2">
        <legend className="section-index mb-3">04 — FINANCIAL DETAILS</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="field-label" htmlFor="hours">Hours worked</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                id="hours"
                type="number"
                min={0}
                step={0.25}
                placeholder="0.00"
                value={data.hours || ''}
                onChange={handleNumber('hours')}
                className={clsx(fieldClass('hours'), 'font-mono tabular !mt-0')}
              />
              <Stepper
                value={data.hours}
                step={0.25}
                onChange={(v) => onChange({ hours: v })}
                ariaLabel="hours worked"
              />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="rate">Hourly rate ($)</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                id="rate"
                type="number"
                min={0}
                step={1}
                placeholder="0.00"
                value={data.rate || ''}
                onChange={handleNumber('rate')}
                className={clsx(fieldClass('rate'), 'font-mono tabular !mt-0')}
              />
              <Stepper value={data.rate} step={5} onChange={(v) => onChange({ rate: v })} ariaLabel="hourly rate" />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="materialCost">Material cost ($)</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                id="materialCost"
                type="number"
                min={0}
                step={1}
                placeholder="0.00"
                value={data.materialCost || ''}
                onChange={handleNumber('materialCost')}
                className={clsx(fieldClass('materialCost'), 'font-mono tabular !mt-0')}
              />
              <Stepper
                value={data.materialCost}
                step={10}
                onChange={(v) => onChange({ materialCost: v })}
                ariaLabel="material cost"
              />
            </div>
          </div>
        </div>

        <div className="bg-canvas border border-rule rounded-[6px] px-4 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <label className="field-label !text-ink">Tax rate</label>
            {data.taxPreset === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={data.taxRate || ''}
                  onChange={handleNumber('taxRate')}
                  placeholder="0.0"
                  className="w-16 text-right py-1 text-[14px] font-mono tabular"
                />
                <span className="font-mono text-[13px] text-slate-ink">%</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {TAX_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => selectTaxPreset(preset)}
                className={clsx(
                  'font-mono text-[12px] px-3 py-1.5 rounded-[4px] border transition-colors',
                  data.taxPreset === preset.value
                    ? 'bg-ledger text-paper border-ledger'
                    : 'bg-transparent text-slate-ink border-rule hover:border-ink hover:text-ink'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </fieldset>
    </form>
  );
}
