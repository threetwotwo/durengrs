import React from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { normalizeTimestamp } from '../context/FarmContext';
import { useT } from '../i18n';
import { reportTags, reportValues } from '../lib/feed';
import { ACTION_INFO, ISSUE_INFO, isAction, isIssue } from '../shared';
import type { TreeReport } from '../types';
import { Tags } from './Record';

/** Gemini answers within a minute; a reading still "running" after this was cut off (the bot does not retry it). */
const STUCK_MS = 10 * 60 * 1000;

/**
 * What was read from a report (the report page): Gemini's summary, the tags, each problem by its name with the first
 * step, the work done, a harvest, what each photo shows, and whether the worker was asked for a better photo.
 */
export const ReportFindings: React.FC<{ report: TreeReport }> = ({ report }) => {
  const { t, lang } = useT();
  const tr = report.triage;
  const stuck = report.ai?.status === 'running' && Date.now() - normalizeTimestamp(report.createdAt) > STUCK_MS;
  const v = reportValues(report);
  const tags = reportTags(v, lang, t('cond.improving').toLowerCase());
  if (v.harvest) tags.push({ key: 'hv', label: [t('feed.picked', { n: v.harvest.fruits }), v.harvest.weightKg ? `${v.harvest.weightKg} kg` : ''].filter(Boolean).join(', '), tone: 'work' });
  const ai = tr?.source === 'ai';
  const issues = ai ? (tr!.issues || []).filter((i) => isIssue(i.code)) : [];
  const actions = ai ? (tr!.actions || []).filter((a) => isAction(a.type)) : [];

  return (
    <section className="space-y-3" aria-label={t('ai.title')}>
      {report.ai?.status === 'running' && !stuck && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          {t('ai.running')}
        </p>
      )}
      {(report.ai?.status === 'failed' || stuck) && <p className="text-xs text-slate-500">{t('ai.failed')}</p>}
      {ai && tr!.summary && <p className="text-sm text-slate-700 leading-relaxed">{tr!.summary}</p>}
      <Tags tags={tags} />

      {issues.length > 0 && !report.review && (
        <ul className="space-y-2">
          {issues.map((i, n) => (
            <li key={`${i.code}-${n}`} className="text-sm">
              <p className="font-semibold text-slate-900">
                {i.name || ISSUE_INFO[i.code].label[lang]}
                {i.photo ? <span className="ml-1.5 font-normal text-xs text-slate-500">{t('ai.photoN', { n: i.photo })}</span> : null}
              </p>
              {i.action && <p className="text-slate-700">{t('ai.firstStep', { what: i.action })}</p>}
            </li>
          ))}
        </ul>
      )}

      {actions.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-800">
          {actions.map((a, n) => (
            <li key={`${a.type}-${n}`}>
              <span className="font-semibold">{ACTION_INFO[a.type].label[lang]}</span>
              {a.product && <span>: {a.product}</span>}
              {a.target && <span className="text-slate-600"> ({a.target})</span>}
            </li>
          ))}
        </ul>
      )}

      {ai && tr!.photosSeen && tr!.photosSeen.length > 1 && (
        <ul className="space-y-0.5 text-xs text-slate-600">
          {tr!.photosSeen.map((p) => (
            <li key={p.photo}>
              <span className="font-semibold text-slate-700">{t('ai.photoN', { n: p.photo })}:</span> {p.seen}
            </li>
          ))}
        </ul>
      )}

      {ai && tr!.photoOk === false && (
        <p className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 text-xs text-amber-900">
          <Camera className="w-4 h-4 shrink-0" aria-hidden />
          <span>{tr!.photoRequest ? t('ai.photoAsked', { what: tr!.photoRequest }) : t('ai.photoAskedShort')}</span>
        </p>
      )}
    </section>
  );
};
