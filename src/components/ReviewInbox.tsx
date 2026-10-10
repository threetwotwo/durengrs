import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Pencil, X } from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db, parseReportDoc } from '../lib/firebase';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { reportUrl, treeUrl } from '../lib/router';
import { rememberReport } from '../lib/reportCache';
import { acceptAll, currentValues, needsReview, reportTriage, saveReview, suggestedValues, type ReviewValues } from '../lib/review';
import { FARM_STAGES, FARM_STAGE_INFO, HEALTH, HEALTH_INFO, IMPROVING, ISSUES, ISSUE_INFO, healthOf, type FarmStage, type Health, type Issue } from '../shared';
import type { TreeCrop } from '../lib/crop';
import type { DurianTree, TreeReport } from '../types';
import { Link } from './Link';
import { Sheet, fieldLabel } from './Sheet';
import { ReportDate } from './ReportDate';
import { StagePill } from './GuideWidgets';
import { FarmStageChip, HealthPill, IssueChip } from './FieldStage';
import { useCrops } from './useCrops';
import { cropMismatch } from './StageBoard';
import { ReportReading } from './FieldStage';
import { ActionChips } from './ReportFindings';

/**
 * "Perlu dicek": worker reports from the last 60 days that a person hasn't looked at yet, each with what the system
 * read from the photos and words (stage, issue, health). One tap confirms; "Ubah" corrects; confirmed values update
 * the tree. Reports with nothing new to check (all fine, or work done on a known problem) are confirmed in one go.
 */

const DAYS = 60;
const MAX = 500;

export function useRecentReports(days = DAYS) {
  const [reports, setReports] = useState<TreeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const since = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);
    return onSnapshot(
      query(collection(db, 'reports'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(MAX)),
      (snap) => {
        setReports(snap.docs.map(parseReportDoc));
        // Hit the limit: older reports of the period were not read, so the inbox can't promise it's complete.
        setFull(snap.size >= MAX);
        setFailed(false);
        setLoading(false);
      },
      (err) => {
        console.error('Review inbox load failed:', err);
        setFailed(true);
        setLoading(false);
      }
    );
  }, [days]);
  return { reports, loading, failed, full };
}

const saveBy = (v: string) => {
  try {
    localStorage.setItem('cilowong.by', v.trim());
  } catch {
    /* ignore */
  }
};

const readBy = () => {
  try {
    return localStorage.getItem('cilowong.by') || '';
  } catch {
    return '';
  }
};

export const ReviewInbox: React.FC = () => {
  const { t } = useT();
  const { trees, allTrees } = useFarm();
  const { reports, loading, failed, full } = useRecentReports();
  const treeById = useMemo(() => new Map(trees.map((x) => [x.id, x])), [trees]);
  // Worked out once for the whole list (each card used to run the crop engine for every tree).
  const { crops } = useCrops();
  const cropByTree = useMemo(() => new Map(crops.map((c) => [c.tree.id, c])), [crops]);
  // A test tree's reports leave the inbox once it is archived.
  const testTrees = useMemo(() => new Set(allTrees.filter((x) => x.active === false && x.archivedReason === 'test').map((x) => x.id)), [allTrees]);
  const open = useMemo(() => reports.filter((r) => !r.review && !testTrees.has(r.treeId)), [reports, testTrees]);
  const pending = useMemo(() => open.filter(needsReview), [open]);
  const fine = useMemo(() => open.filter((r) => !needsReview(r)), [open]);
  const [editing, setEditing] = useState<TreeReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [by, setBy] = useState(readBy);
  // A few at a time, so the full list below stays in reach; one tap shows up to 20.
  const [many, setMany] = useState(false);
  const shownN = many ? 100 : 12;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      console.error('Review save failed:', e);
      setError(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
    } finally {
      setBusy(null);
    }
  };
  const who = by.trim() || undefined;

  if (loading) return null;
  return (
    <section className="bg-white rounded-xl border-2 border-sky-200 overflow-hidden" aria-labelledby="inbox-h">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="inbox-h" className="text-base font-bold text-slate-900">
            {t('inbox.title')} <span className="tabular text-slate-500 font-medium">({pending.length})</span>
          </h2>
          <p className="text-xs text-slate-600">{t('inbox.sub')}</p>
        </div>
        <label className="text-xs text-slate-600 inline-flex items-center gap-2">
          {t('inbox.by')}
          <input
            value={by}
            onChange={(e) => {
              setBy(e.target.value);
              saveBy(e.target.value);
            }}
            className="min-h-9 w-32 px-2 rounded-lg border border-slate-300 text-sm"
          />
        </label>
      </div>
      {error && <p role="alert" className="px-4 py-2 text-sm text-rose-700 bg-rose-50">{error}</p>}
      {failed && <p role="alert" className="px-4 py-2 text-sm text-amber-900 bg-amber-50">{t('inbox.loadError')}</p>}
      {full && <p className="px-4 py-2 text-xs text-slate-600 bg-slate-50 border-b border-slate-100">{t('inbox.full', { n: MAX, days: DAYS })}</p>}
      {failed ? null : pending.length === 0 ? (
        <p className="p-5 text-sm text-slate-600 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          {t('inbox.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {pending.slice(0, shownN).map((r) => (
            <ReviewCard
              key={r.id}
              report={r}
              tree={treeById.get(r.treeId)}
              crop={cropByTree.get(r.treeId)}
              busy={busy === r.id}
              onAccept={() => run(r.id, () => saveReview(r, treeById.get(r.treeId), 'accepted', suggestedValues(reportTriage(r), r), who))}
              onEdit={() => setEditing(r)}
              onDismiss={() => run(r.id, () => saveReview(r, treeById.get(r.treeId), 'dismissed', { issues: [] }, who))}
            />
          ))}
        </ul>
      )}
      {pending.length > shownN &&
        (many ? (
          <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-100">{t('inbox.more', { n: pending.length - shownN })}</p>
        ) : (
          <button
            type="button"
            onClick={() => setMany(true)}
            className="w-full min-h-11 px-4 border-t border-slate-100 text-sm font-semibold text-sky-800 hover:bg-sky-50"
          >
            {t('inbox.showMore', { n: Math.min(100, pending.length) - shownN })}
          </button>
        ))}
      {fine.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
          <span className="text-sm text-slate-700">
            <CheckCircle2 className="w-4 h-4 inline -mt-0.5 mr-1 text-emerald-600" aria-hidden />
            {t('inbox.fine', { n: fine.length })}{' '}
            <span className="text-xs text-slate-500">{fine.slice(0, 8).map((r) => r.treeId).join(', ')}{fine.length > 8 ? '…' : ''}</span>
          </span>
          <button
            type="button"
            disabled={busy === 'fine'}
            onClick={() => run('fine', () => acceptAll(fine.map((r) => ({ report: r, tree: treeById.get(r.treeId) })), who))}
            className="min-h-10 px-3 rounded-lg border border-emerald-300 bg-white text-sm font-semibold text-emerald-800 hover:bg-emerald-50 inline-flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            {t('inbox.fineAll')}
          </button>
        </div>
      )}
      {editing && (
        <ReviewSheet
          report={editing}
          onClose={() => setEditing(null)}
          onSave={(v) =>
            run(editing.id, async () => {
              await saveReview(editing, treeById.get(editing.treeId), 'corrected', v, who);
              setEditing(null);
            })
          }
        />
      )}
    </section>
  );
};

const ReviewCard: React.FC<{
  report: TreeReport;
  tree?: DurianTree;
  crop?: TreeCrop;
  busy: boolean;
  onAccept: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}> = ({ report, tree, crop, busy, onAccept, onEdit, onDismiss }) => {
  const { t } = useT();
  const { workerLabel } = useFarm();
  const tr = reportTriage(report);
  const photo = report.photos?.[0];
  const expected = crop?.waves[0]?.stage;
  const mismatch = !!tr.stage && cropMismatch(tr.stage.code, crop);
  const empty = !tr.stage && tr.issues.length === 0 && !tr.health;
  return (
    <li className="p-4 grid gap-3 sm:grid-cols-[140px_1fr]">
      {photo ? (
        <Link to={reportUrl(report.id)} onClick={() => rememberReport(report)} className="block">
          <img
            src={photo.medium || photo.thumb || photo.url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full aspect-[16/9] sm:aspect-square sm:w-[140px] object-cover rounded-lg border border-slate-200 bg-slate-100"
          />
        </Link>
      ) : (
        <span className="hidden sm:flex w-[140px] aspect-square rounded-lg border border-dashed border-amber-300 bg-amber-50 text-xs text-amber-800 items-center justify-center text-center p-2">
          {t('inbox.noPhoto')}
        </span>
      )}
      <div className="min-w-0 space-y-2">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Link to={treeUrl(report.treeId)} className="font-bold text-slate-900 hover:text-emerald-700 hover:underline">
            {t('rep.treeN', { id: report.treeId })}
          </Link>
          <span className="text-xs text-slate-500">{[tree?.variant, report.block || tree?.block ? t('common.blockN', { n: report.block || tree!.block }) : null].filter(Boolean).join(' · ')}</span>
          <ReportDate value={report.createdAt} />
          {report.workerPhone && <span className="text-xs text-slate-500">{workerLabel(report.workerPhone)}</span>}
        </p>
        <blockquote className="text-sm text-slate-800 border-l-2 border-slate-300 pl-3 whitespace-pre-line">
          {report.description?.trim() || <span className="text-slate-400">{t('inbox.noWords')}</span>}
        </blockquote>
        {tr.source === 'ai' && tr.summary && <p className="text-sm text-slate-700">{tr.summary}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500">{tr.source === 'ai' ? t('inbox.readAi') : t('inbox.read')}</span>
          {empty ? (
            <span className="text-xs text-slate-500">{t('inbox.nothing')}</span>
          ) : (
            <>
              {tr.stage && <FarmStageChip code={tr.stage.code} mismatch={mismatch} title={tr.stage.evidence} />}
              {tr.issues.map((i, n) => (
                <IssueChip key={`${i.code}-${n}`} code={i.code} name={i.name} />
              ))}
              <HealthPill health={tr.health} improving={tr.improving} />
            </>
          )}
        </div>
        <ActionChips report={report} />
        {tr.photoOk === false && <p className="text-xs text-amber-800">{t('ai.photoAskedShort')}</p>}
        <ConditionSourceNote report={report} />
        {expected && (
          <p className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5">
            {t('inbox.expected')} <StagePill stage={expected} farm />
            {mismatch && <span className="text-violet-800 font-semibold">{t('inbox.mismatch')}</span>}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onAccept} className="min-h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-60">
            <Check className="w-4 h-4" />
            {empty ? t('inbox.checked') : t('inbox.accept')}
          </button>
          <button type="button" disabled={busy} onClick={onEdit} className="min-h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5">
            <Pencil className="w-4 h-4" />
            {t('inbox.edit')}
          </button>
          <button type="button" disabled={busy} onClick={onDismiss} className="min-h-10 px-3 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 inline-flex items-center gap-1.5">
            <X className="w-4 h-4" />
            {t('inbox.dismiss')}
          </button>
        </div>
      </div>
    </li>
  );
};

/**
 * On the report page: what the report says about the tree (stage, issues, health) and, until someone checks it, the
 * same Benar / Ubah / Abaikan as the inbox. Checked values can still be changed.
 */
export const ReportReviewPanel: React.FC<{ report: TreeReport; tree?: DurianTree }> = ({ report, tree }) => {
  const { t } = useT();
  const { crops } = useCrops();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tr = reportTriage(report);
  const crop = crops.find((c) => c.tree.id === report.treeId);
  const expected = crop?.waves[0]?.stage;
  const decision = report.review?.decision;
  const shown = decision && decision !== 'dismissed' ? (report.stage as FarmStage | undefined) : tr.stage?.code;
  const mismatch = !!shown && cropMismatch(shown, crop);
  const who = readBy() || undefined;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      console.error('Review save failed:', e);
      setError(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
    } finally {
      setBusy(false);
    }
  };
  const btn = 'min-h-10 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60';

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('rep.detail.reading')}</h2>
      {decision === 'dismissed' ? (
        <p className="text-sm text-slate-500">{t('inbox.dismissed')}</p>
      ) : (
        <ReportReading report={report} health />
      )}
      {!decision && !tr.stage && tr.issues.length === 0 && !tr.health && <p className="text-sm text-slate-500">{t('inbox.nothing')}</p>}
      <ConditionSourceNote report={report} />
      {expected && (
        <p className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5">
          {t('inbox.expected')} <StagePill stage={expected} farm />
          {mismatch && <span className="text-violet-800 font-semibold">{t('inbox.mismatch')}</span>}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {decision ? (
          <span className="text-xs text-slate-600 inline-flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden />
            {report.review?.by ? t('inbox.doneBy', { by: report.review.by }) : t('inbox.done')}
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => saveReview(report, tree, 'accepted', suggestedValues(tr, report), who))}
            className={`${btn} px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold`}
          >
            <Check className="w-4 h-4" />
            {!tr.stage && tr.issues.length === 0 && !tr.health ? t('inbox.checked') : t('inbox.accept')}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => setEditing(true)} className={`${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>
          <Pencil className="w-4 h-4" />
          {t('inbox.edit')}
        </button>
        {!decision && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => saveReview(report, tree, 'dismissed', { issues: [] }, who))}
            className={`${btn} text-slate-500 hover:text-slate-800 hover:bg-slate-100`}
          >
            <X className="w-4 h-4" />
            {t('inbox.dismiss')}
          </button>
        )}
      </div>
      {editing && (
        <ReviewSheet
          report={report}
          onClose={() => setEditing(false)}
          onSave={(v) =>
            run(async () => {
              await saveReview(report, tree, 'corrected', v, who);
              setEditing(false);
            })
          }
        />
      )}
    </div>
  );
};

/** Who changed the tree's condition with this report: the worker's own pick, or urgent words (undone by "Abaikan"). */
const ConditionSourceNote: React.FC<{ report: TreeReport }> = ({ report }) => {
  const { t, lang } = useT();
  if (!report.conditionChanged || !report.conditionSource) return null;
  const word = (c?: string) => {
    const h = healthOf(c);
    return h ? HEALTH_INFO[h].label[lang] : c || '—';
  };
  if (report.conditionSource === 'worker') return <p className="text-xs text-slate-700">{t('inbox.workerChose', { cond: word(report.conditionAfter) })}</p>;
  return (
    <p className="text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
      {t('inbox.autoRed', { before: word(report.conditionBefore) })}
    </p>
  );
};

/** Correct what the system read: stage (or "tidak yakin"), issues, health. */
export const ReviewSheet: React.FC<{ report: TreeReport; onClose: () => void; onSave: (v: ReviewValues) => void }> = ({ report, onClose, onSave }) => {
  const { t, lang } = useT();
  // What was checked before (a re-opened "Ubah" keeps a cleared stage or "membaik" cleared), else the suggestion.
  const start = currentValues(report);
  const [stage, setStage] = useState<FarmStage | undefined>(start.stage);
  const [issues, setIssues] = useState<Issue[]>(start.issues);
  const [health, setHealth] = useState<Health | undefined>(start.health);
  const [improving, setImproving] = useState(!!start.improving);
  const chip = (on: boolean) =>
    `min-h-10 px-3 rounded-full border text-sm font-semibold ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`;
  return (
    <Sheet
      title={t('inbox.edit.title')}
      subtitle={`${t('rep.treeN', { id: report.treeId })} · ${report.description?.slice(0, 60) || ''}`}
      onClose={onClose}
      footer={
        <button type="button" onClick={() => onSave({ stage, issues, health, improving })} className="w-full min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold">
          {t('inbox.edit.save')}
        </button>
      }
    >
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
        <span className={fieldLabel}>{t('inbox.edit.health')}</span>
        <div className="flex flex-wrap gap-1.5">
          {HEALTH.map((h) => (
            <button key={h} type="button" aria-pressed={health === h} onClick={() => setHealth(h)} className={chip(health === h)}>
              {HEALTH_INFO[h].label[lang]} · <span className="font-normal">{HEALTH_INFO[h].meaning[lang]}</span>
            </button>
          ))}
        </div>
        <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={improving} onChange={(e) => setImproving(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
          {IMPROVING[lang]}
        </label>
      </div>
    </Sheet>
  );
};
