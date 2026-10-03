import React from 'react';

/** Same heading pattern on every page: title, one-line purpose, actions on the right. */
export const PageHeader: React.FC<{
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, description, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      {description && <p className="text-sm text-slate-600 mt-0.5">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);

export const btnPrimary =
  'min-h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600';
export const btnSecondary =
  'min-h-11 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600';
export const inputCls =
  'w-full min-h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-500 focus:outline-2 focus:outline-emerald-500 focus:border-emerald-500';
