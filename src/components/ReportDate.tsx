import React from 'react';
import { normalizeTimestamp } from '../context/FarmContext';
import { useT } from '../i18n';

/** "02 Oct 2026" in strong text, plus the relative time as a pill (green when under 24h). */
export const ReportDate: React.FC<{ value: any }> = ({ value }) => {
  const { t, locale } = useT();
  const ts = normalizeTimestamp(value);
  if (!ts) return <span className="text-sm text-slate-500">—</span>;

  const date = new Date(ts).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  let ago: string;
  if (mins < 1) ago = t('time.justNow');
  else if (mins < 60) ago = t('time.minAgo', { n: mins });
  else if (mins < 1440) ago = t('time.hAgo', { n: Math.floor(mins / 60) });
  else if (mins < 43200) ago = t('time.dAgo', { n: Math.floor(mins / 1440) });
  else ago = t('time.moAgo', { n: Math.floor(mins / 43200) });
  const fresh = mins < 1440;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">{date}</span>
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${
          fresh
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-slate-100 text-slate-600 border-slate-200'
        }`}
      >
        {ago}
      </span>
    </span>
  );
};
