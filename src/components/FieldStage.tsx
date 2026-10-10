import React from 'react';
import { CheckCircle2, Eye, Sparkles } from 'lucide-react';
import { useT } from '../i18n';
import { FARM_STAGE_INFO, HEALTH_INFO, IMPROVING, ISSUE_INFO, isFarmStage, isIssue, triageText, type Health, type Issue } from '../shared';
import type { TreeReport } from '../types';

/**
 * Small chips in the farm's words, shared by the review inbox, report pages, tree pages and the Kebun sheet:
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

/**
 * What a report says about the tree, in one row: the checked stage and issues once a person reviewed it, else the
 * system's suggestion (marked as such). Nothing for a dismissed report or one the system could not read.
 */
export const ReportReading: React.FC<{ report: TreeReport; health?: boolean; className?: string }> = ({ report, health, className = '' }) => {
  const { t } = useT();
  const decision = report.review?.decision;
  if (decision === 'dismissed') return null;
  const checked = !!decision;
  const tr = checked ? null : report.triage || triageText(report.description);
  const stage = checked ? report.stage : tr?.stage?.code;
  const issues = (checked ? report.issues || [] : tr?.issues.map((i) => i.code) || []).filter(isIssue);
  // Gemini's specific names, shown on the matching category (also after a review that kept that category).
  const names = new Map((report.triage?.issues || []).filter((i) => i.name).map((i) => [i.code, i.name!]));
  const hp = health ? (checked ? report.health : tr?.health) : undefined;
  if (!stage && issues.length === 0 && !hp) return null;
  return (
    <p className={`flex flex-wrap items-center gap-1 text-xs ${className}`}>
      {checked ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-label={t('stage.confirmed')}>
          <title>{t('stage.confirmed')}</title>
        </CheckCircle2>
      ) : (
        <Sparkles className="w-3.5 h-3.5 text-slate-400" aria-label={t('stage.suggested')}>
          <title>{t('stage.suggested')}</title>
        </Sparkles>
      )}
      <FarmStageChip code={stage} stale={!checked} title={checked ? t('stage.confirmed') : t('stage.suggested')} />
      {issues.map((c) => (
        <IssueChip key={c} code={c} name={names.get(c)} className={checked ? '' : 'opacity-75 border-dashed'} />
      ))}
      {hp && <HealthPill health={hp} improving={checked ? report.improving : tr?.improving} className={checked ? '' : 'opacity-75 border-dashed'} />}
    </p>
  );
};
