'use client';

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'error' | 'info';
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

const toneStyles: Record<ToastMessage['tone'], string> = {
  success: 'bg-ink text-paper border-ledger',
  error: 'bg-ink text-paper border-danger',
  info: 'bg-ink text-paper border-rule',
};

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="no-print fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[92%] max-w-sm mb-[env(safe-area-inset-bottom)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`${toneStyles[t.tone]} border-l-4 rounded-[6px] px-4 py-3 text-[13px] font-body shadow-lg flex items-start justify-between gap-3 animate-[fadeIn_.15s_ease-out]`}
        >
          <span className="leading-snug">{t.text}</span>
          <button
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            className="font-mono text-paper/60 hover:text-paper shrink-0"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
