import React, { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useT } from '../i18n';
import { currentValues, saveReview, type ReviewValues } from '../lib/review';
import { FARM_STAGES, FARM_STAGE_INFO, HEALTH, HEALTH_INFO, IMPROVING, ISSUES, ISSUE_INFO, type FarmStage, type Health, type Issue } from '../shared';
import type { DurianTree, TreeReport } from '../types';
import { Sheet, fieldInput, fieldLabel } from './Sheet';

/**
 * Every report counts as read; the owner can still change what was read from one (stage, problems, health), or set
 * the reading aside. When it is the tree's latest report, the tree follows the change (lib/review.ts).
 */

const BY_KEY = 'cilowong.by';
export const readBy = () => {
  try {
    return localStorage.getItem(BY_KEY) || '';
  } catch {
    return '';
  }
};
const saveBy = (v: string) => {
  try {
    localStorage.setItem(BY_KEY, v.trim());
  } catch {
    /* private mode */
  }
};

/** "Change" on a report, and who changed it last. */
export const ReportChange: React.FC<{ report: TreeReport; tree?: DurianTree }> = ({ report, tree }) => {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = report.review;
  const save = async (decision: 'corrected' | 'dismissed', v: ReviewValues, by: string) => {
    setError(null);
    saveBy(by);
    try {
      await saveReview(report, tree, decision, v, by.trim() || undefined);
      setOpen(false);
    } catch (e: any) {
      console.error('Report change failed:', e);
      setError(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
      >
        <Pencil className="w-4 h-4" aria-hidden />
        {t('change.button')}
      </button>
      {changed && (
        <span className="text-xs text-slate-500">
          {changed.decision === 'dismissed'
            ? t('change.setAside')
            : changed.by
              ? t('change.byName', { by: changed.by })
              : t('change.byOwner')}
        </span>
      )}
      {error && <p role="alert" className="w-full text-sm text-rose-700">{error}</p>}
      {open && <ReportChangeSheet report={report} onClose={() => setOpen(false)} onSave={save} />}
    </div>
  );
};

const ReportChangeSheet: React.FC<{
  report: TreeReport;
  onClose: () => void;
  onSave: (decision: 'corrected' | 'dismissed', v: ReviewValues, by: string) => Promise<void>;
}> = ({ report, onClose, onSave }) => {
  const { t, lang } = useT();
  // What was changed before, else what was read.
  const start = currentValues(report);
  const [stage, setStage] = useState<FarmStage | undefined>(start.stage);
  const [issues, setIssues] = useState<Issue[]>(start.issues);
  const [health, setHealth] = useState<Health | undefined>(start.health);
  const [improving, setImproving] = useState(!!start.improving);
  const [by, setBy] = useState(readBy);
  const [busy, setBusy] = useState(false);
  const run = async (decision: 'corrected' | 'dismissed', v: ReviewValues) => {
    setBusy(true);
    await onSave(decision, v, by);
    setBusy(false);
  };
  const chip = (on: boolean) =>
    `min-h-10 px-3 rounded-full border text-sm font-semibold ${on ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`;
  return (
    <Sheet
      title={t('change.title')}
      subtitle={t('rep.treeN', { id: report.treeId })}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => run('corrected', { stage, issues, health, improving })}
            className="w-full min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-60"
          >
            {t('change.save')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run('dismissed', { issues: [] })}
            className="w-full min-h-10 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            {t('change.ignore')}
          </button>
        </div>
      }
    >
      <div>
        <span className={fieldLabel}>{t('inbox.edit.health')}</span>
        <div className="flex flex-wrap gap-1.5">
          {HEALTH.map((h) => (
            <button key={h} type="button" aria-pressed={health === h} onClick={() => setHealth(h)} className={chip(health === h)}>
              {HEALTH_INFO[h].label[lang]}
            </button>
          ))}
        </div>
        <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={improving} onChange={(e) => setImproving(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
          {IMPROVING[lang]}
        </label>
      </div>
      <div>
        <span className={fieldLabel}>{t('inbox.edit.issues')}</span>
        <div className="flex flex-wrap gap-1.5">
          {ISSUES.map((i) => {
            const on = issues.includes(i);
            return (
              <button key={i} type="button" aria-pressed={on} onClick={() => setIssues((p) => (on ? p.filter((x) => x !== i) : [...p, i]))} className={chip(on)}>
                {ISSUE_INFO[i].label[lang]}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <span className={fieldLabel}>{t('inbox.edit.stage')}</span>
        <div className="flex flex-wrap gap-1.5">
          {FARM_STAGES.map((s) => (
            <button key={s} type="button" aria-pressed={stage === s} onClick={() => setStage(s)} className={chip(stage === s)} title={FARM_STAGE_INFO[s].sees[lang]}>
              {FARM_STAGE_INFO[s].label[lang]}
            </button>
          ))}
          <button type="button" aria-pressed={!stage} onClick={() => setStage(undefined)} className={chip(!stage)}>
            {t('inbox.edit.unsure')}
          </button>
        </div>
      </div>
      <label className="block">
        <span className={fieldLabel}>{t('change.by')}</span>
        <input value={by} onChange={(e) => setBy(e.target.value)} maxLength={60} className={fieldInput} autoComplete="name" />
      </label>
    </Sheet>
  );
};
