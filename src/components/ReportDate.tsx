import React from 'react';
import { normalizeTimestamp } from '../context/FarmContext';

/** "02 Oct 2026" in strong text, plus the relative time as a pill (green when under 24h). */
export const ReportDate: React.FC<{ value: any }> = ({ value }) => {
  const ts = normalizeTimestamp(value);
  if (!ts) return <span className="text-sm text-slate-500">—</span>;

  const date = new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  let ago: string;
  if (mins < 1) ago = 'just now';
  else if (mins < 60) ago = `${mins}m ago`;
  else if (mins < 1440) ago = `${Math.floor(mins / 60)}h ago`;
  else if (mins < 43200) ago = `${Math.floor(mins / 1440)}d ago`;
  else ago = `${Math.floor(mins / 43200)}mo ago`;
  const fresh = mins < 1440;

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-sm font-semibold text-slate-900">{date}</span>
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
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
