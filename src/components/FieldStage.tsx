import React from 'react';
import { Eye } from 'lucide-react';
import { useT } from '../i18n';
import { FARM_STAGE_INFO, HEALTH_INFO, IMPROVING, ISSUE_INFO, isFarmStage, type Health, type Issue } from '../shared';

/**
 * Small chips in the farm's words, shared by the report pages, tree pages and the Trees sheet:
 * observed stage (what was seen on the tree), health (Hijau / Kuning / Merah) and issue names.
 */

/** What was seen on the tree. `stale` = observed long ago; `mismatch` = doesn't fit the stage expected from the bloom date. */
export const FarmStageChip: React.FC<{ code?: string; mismatch?: boolean; stale?: boolean; title?: string; className?: string }> = ({
  code,
  mismatch,
  stale,
  title,
  className = '',
}) => {
  const { lang } = useT();
  if (!code || !isFarmStage(code)) return null;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${
        mismatch ? 'bg-violet-50 text-violet-800 border-violet-300' : stale ? 'bg-white text-slate-500 border-slate-300 border-dashed' : 'bg-sky-50 text-sky-800 border-sky-200'
      } ${className}`}
    >
      <Eye className="w-3 h-3" aria-hidden />
      {FARM_STAGE_INFO[code].label[lang]}
    </span>
  );
};

const HEALTH_CLS: Record<Health, string> = {
  hijau: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  kuning: 'bg-amber-50 text-amber-900 border-amber-300',
  merah: 'bg-rose-50 text-rose-800 border-rose-300',
};
const HEALTH_DOT: Record<Health, string> = { hijau: 'bg-emerald-500', kuning: 'bg-amber-400', merah: 'bg-rose-500' };

export const HealthPill: React.FC<{ health?: Health; improving?: boolean; className?: string }> = ({ health, improving, className = '' }) => {
  const { lang } = useT();
  if (!health) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${HEALTH_CLS[health]} ${className}`}>
      <span className={`w-2 h-2 rounded-full ${HEALTH_DOT[health]}`} aria-hidden />
      {HEALTH_INFO[health].label[lang]}
      {improving ? <span className="font-normal">· {IMPROVING[lang]}</span> : null}
    </span>
  );
};

/** An issue in the farm's category colour; with `name` (Gemini's specific pest or disease) it shows the name. */
export const IssueChip: React.FC<{ code: Issue; name?: string; className?: string }> = ({ code, name, className = '' }) => {
  const { lang } = useT();
  const info = ISSUE_INFO[code];
  return (
    <span
      title={name ? info.label[lang] : undefined}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border max-w-full truncate ${HEALTH_CLS[info.health]} ${className}`}
    >
      {name || info.label[lang]}
    </span>
  );
};
