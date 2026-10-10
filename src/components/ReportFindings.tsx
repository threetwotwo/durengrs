import React from 'react';
import { Camera, Loader2, Sparkles, Stethoscope, Wheat } from 'lucide-react';
import { useT } from '../i18n';
import { ACTION_INFO, ISSUE_INFO, isAction, isIssue } from '../shared';
import type { TreeReport } from '../types';
import { IssueChip } from './FieldStage';
import { normalizeTimestamp } from '../context/FarmContext';

/** Gemini answers within a minute; a reading still "running" after this was cut off (the bot does not retry it). */
const STUCK_MS = 10 * 60 * 1000;

/**
 * What Gemini read from a report's photos and words (bot/lib/ai.js): a short summary, what each photo shows, the
 * problems by their specific name with the first step, the work the worker did, a harvest, and whether the worker
 * was asked for a better photo. Nothing for a report only read by its words.
 */
export const ReportFindings: React.FC<{ report: TreeReport }> = ({ report }) => {
  const { t, lang } = useT();
  const tr = report.triage;
  const stuck = report.ai?.status === 'running' && Date.now() - normalizeTimestamp(report.createdAt) > STUCK_MS;
  if (report.ai?.status === 'running' && !stuck) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        {t('ai.running')}
      </p>
    );
  }
  if (!tr || tr.source !== 'ai') {
    return report.ai?.status === 'failed' || stuck ? <p className="text-xs text-slate-500">{t('ai.failed')}</p> : null;
  }
  const actions = (tr.actions || []).filter((a) => isAction(a.type));
  const h = tr.harvest;
  const grades = h?.grades
    ? (['extra', 'class1', 'class2', 'reject'] as const).filter((g) => h.grades![g]).map((g) => `${t(`grade.${g}`)} ${h.grades![g]}`)
    : [];

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3" aria-labelledby={`ai-${report.id}`}>
      <h2 id={`ai-${report.id}`} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <Sparkles className="w-4 h-4 text-violet-500" aria-hidden />
        {t('ai.title')}
      </h2>
      {tr.summary && <p className="text-sm text-slate-900 leading-relaxed">{tr.summary}</p>}

      {tr.issues.length > 0 && (
        <ul className="space-y-2">
          {tr.issues.map((i, n) => (
            <li key={`${i.code}-${n}`} className="text-sm">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-slate-900">{i.name || (isIssue(i.code) ? ISSUE_INFO[i.code].label[lang] : i.code)}</span>
                {i.name && isIssue(i.code) && i.code !== 'other' && <IssueChip code={i.code} />}
                {i.photo ? <span className="text-xs text-slate-500">{t('ai.photoN', { n: i.photo })}</span> : null}
              </span>
              {i.action && <span className="block text-xs text-slate-700 mt-0.5">{t('ai.firstStep', { what: i.action })}</span>}
            </li>
          ))}
        </ul>
      )}

      {actions.length > 0 && (
        <ul className="space-y-1.5">
          {actions.map((a, n) => (
            <li key={`${a.type}-${n}`} className="flex items-start gap-2 text-sm text-slate-800">
              <Stethoscope className="w-4 h-4 mt-0.5 text-sky-700 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">{ACTION_INFO[a.type].label[lang]}</span>
                {a.product && <span> · {a.product}</span>}
                {a.target && <span className="text-slate-600"> · {t('ai.for', { what: a.target })}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {h && (
        <p className="flex items-start gap-2 text-sm text-slate-800">
          <Wheat className="w-4 h-4 mt-0.5 text-emerald-700 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">{t('ai.harvest', { n: h.fruits })}</span>
            {h.weightKg ? ` · ${h.weightKg} kg` : ''}
            {grades.length ? ` · ${grades.join(', ')}` : ''}
          </span>
        </p>
      )}

      {tr.photosSeen && tr.photosSeen.length > 1 && (
        <ul className="space-y-0.5 text-xs text-slate-600">
          {tr.photosSeen.map((p) => (
            <li key={p.photo}>
              <span className="font-semibold text-slate-700">{t('ai.photoN', { n: p.photo })}:</span> {p.seen}
            </li>
          ))}
        </ul>
      )}

      {tr.photoOk === false && (
        <p className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <Camera className="w-4 h-4 shrink-0" aria-hidden />
          <span>{tr.photoRequest ? t('ai.photoAsked', { what: tr.photoRequest }) : t('ai.photoAskedShort')}</span>
        </p>
      )}
    </section>
  );
};

/** Work done, as small chips (report cards, the field log). */
export const ActionChips: React.FC<{ report: TreeReport; className?: string }> = ({ report, className = '' }) => {
  const { lang } = useT();
  const actions = (report.triage?.actions || []).filter((a) => isAction(a.type));
  if (!actions.length) return null;
  const seen = new Set<string>();
  return (
    <p className={`flex flex-wrap items-center gap-1 text-xs ${className}`}>
      <Stethoscope className="w-3.5 h-3.5 text-sky-700" aria-hidden />
      {actions
        .filter((a) => !seen.has(a.type) && seen.add(a.type))
        .map((a) => (
          <span key={a.type} className="inline-flex items-center px-2 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-sky-800 font-semibold whitespace-nowrap">
            {ACTION_INFO[a.type].label[lang]}
          </span>
        ))}
    </p>
  );
};
