'use client';

interface StepperProps {
  value: number;
  step: number;
  min?: number;
  onChange: (next: number) => void;
  ariaLabel: string;
}

/**
 * Small +/- control that sits next to a numeric input so users can nudge
 * hours, rate, or material cost with single clicks instead of typing.
 */
export default function Stepper({ value, step, min = 0, onChange, ariaLabel }: StepperProps) {
  const bump = (dir: 1 | -1) => {
    const raw = Math.round((value + dir * step) * 100) / 100;
    onChange(Math.max(min, raw));
  };

  return (
    <div className="flex items-center border border-rule rounded-[4px] overflow-hidden shrink-0">
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => bump(-1)}
        className="w-7 h-7 flex items-center justify-center text-slate-ink hover:bg-canvas hover:text-ink transition-colors font-mono text-sm"
      >
        −
      </button>
      <div className="w-px self-stretch bg-rule" />
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => bump(1)}
        className="w-7 h-7 flex items-center justify-center text-slate-ink hover:bg-canvas hover:text-ink transition-colors font-mono text-sm"
      >
        +
      </button>
    </div>
  );
}
