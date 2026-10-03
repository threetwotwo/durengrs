import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/** Bottom sheet on phones, centered dialog on desktop. Esc and backdrop close it. */
export const Sheet: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ title, subtitle, onClose, children, footer }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-slate-950/60" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg max-h-[92vh] flex flex-col bg-white rounded-t-2xl md:rounded-2xl shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 -m-1 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="p-4 border-t border-slate-200 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
};

export const fieldLabel = 'block text-xs font-semibold text-slate-700 mb-1';
export const fieldInput =
  'w-full min-h-11 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-2 focus:outline-emerald-500 focus:border-emerald-500';
