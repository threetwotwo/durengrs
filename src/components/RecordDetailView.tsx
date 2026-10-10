import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Trash2, Wheat } from 'lucide-react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db, parseReportDoc } from '../lib/firebase';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { goBack, navigate, reportUrl, treeUrl } from '../lib/router';
import { buildFieldLog, type LogEntry, type LogKind, type TreeEdit } from '../lib/fieldLog';
import { GRADES } from '../lib/fieldData';
import { SEASON_TASKS } from '../lib/fieldInsights';
import { TOPIC_BY_ID, pick } from '../lib/guide';
import { diffDays, formatShortDate, todayStr } from '../lib/treatments';
import { useGuideOn } from '../lib/guideMode';
import type { TreeReport } from '../types';
import { ConditionBadge } from './ConditionBadge';
import { improvingNow } from '../lib/trees';
import { Link } from './Link';
import { PhotoGrid, RecordCard, RecordGrid } from './Record';
import { StagePill, blockLine } from './GuideWidgets';
import { TreeStageCell } from './StageBoard';
import { useCrops } from './useCrops';
import { FIELD_KEY, TEXT_FIELDS, canDelete, deleteRecord, localDay, useEditValue } from './LogParts';

const card = 'bg-white rounded-xl border border-slate-200 p-4 space-y-3';
const h2 = 'text-sm font-bold text-slate-900';
/** How long to wait for the farm's records before saying a record doesn't exist (deep link on a slow signal). */
const SETTLE_MS = 4000;

type Kind = Exclude<LogKind, 'issue'>;

/**
 * One field record other than a worker report (those have ReportDetailView): a flowering, count, harvest, season
 * task, rain day or tree data edit. Shows what was recorded, by whom, its photos, the tree or block now, and the
 * other records around it.
 */
export const RecordDetailView: React.FC<{ kind: Kind; id: string }> = ({ kind, id }) => {
  const { t, lang, locale } = useT();
  const guideOn = useGuideOn();
  const { allTrees, treeBlooms, cropCounts, harvests, seasonTasksDone, rain, workerLabel } = useFarm();
  const { crops, seasons } = useCrops();
  const value = useEditValue();
  const [edit, setEdit] = useState<TreeEdit | null | undefined>(undefined);
  const [treeReports, setTreeReports] = useState<TreeReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);

  // Tree edits aren't kept in memory: read this one live.
  useEffect(() => {
    if (kind !== 'treeData') return;
    return onSnapshot(
      doc(db, 'treeEdits', id),
      (snap) => setEdit(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as TreeEdit) : null),
      (err) => {
        console.error('Failed to load tree edit:', err);
        setEdit(null);
      }
    );
  }, [kind, id]);

  const blockOf = useMemo(() => {
    const m = new Map(allTrees.map((x) => [x.id, x.block]));
    return (treeId: string) => m.get(treeId);
  }, [allTrees]);

  const entry: LogEntry | undefined = useMemo(() => {
    const only =
      kind === 'bloom'
        ? { blooms: treeBlooms.filter((b) => b.id === id) }
        : kind === 'count'
          ? { counts: cropCounts.filter((c) => c.id === id) }
          : kind === 'harvest'
            ? { harvests: harvests.filter((h) => h.id === id) }
            : kind === 'task'
              ? { tasks: seasonTasksDone.filter((s) => s.id === id) }
              : kind === 'rain'
                ? { rain: rain.filter((r) => r.date === id) }
                : { edits: edit ? [edit] : [] };
    return buildFieldLog({ ...only, blockOf })[0];
  }, [kind, id, treeBlooms, cropCounts, harvests, seasonTasksDone, rain, edit, blockOf]);

  // The tree's latest reports, for "other records" (same query and index as the tree page).
  const treeId = entry?.treeId;
  useEffect(() => {
    if (!treeId) return;
    return onSnapshot(
      query(collection(db, 'reports'), where('treeId', '==', treeId), orderBy('createdAt', 'desc'), limit(5)),
      (snap) => setTreeReports(snap.docs.map(parseReportDoc)),
      (err) => console.error('Failed to load tree reports:', err)
    );
  }, [treeId]);

  const related = useMemo(() => {
    if (!entry) return [];
    let list: LogEntry[] = [];
    if (entry.treeId) {
      const tid = entry.treeId;
      list = buildFieldLog({
        reports: treeReports,
        blooms: treeBlooms.filter((b) => b.treeId === tid),
        counts: cropCounts.filter((c) => c.treeId === tid),
        harvests: harvests.filter((h) => h.treeId === tid),
        blockOf,
      });
    } else if (entry.kind === 'task' || entry.kind === 'harvest') {
      list = buildFieldLog({ tasks: seasonTasksDone.filter((s) => s.block === entry.block), harvests: harvests.filter((h) => h.block === entry.block && !h.treeId) });
    } else if (entry.kind === 'rain') {
      const date = entry.rec.date;
      list = buildFieldLog({ rain: rain.filter((r) => Math.abs(diffDays(r.date, date)) <= 7) });
    }
    return list.filter((e) => e.key !== entry.key).slice(0, 8);
  }, [entry, treeReports, treeBlooms, cropCounts, harvests, seasonTasksDone, rain, blockOf]);

  if (!entry) {
    const waiting = kind === 'treeData' ? edit === undefined : !settled;
    return waiting ? <div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" /> : <Notice text={t('rec.detail.missing')} />;
  }

  const e = entry;
  const tree = e.treeId ? allTrees.find((x) => x.id === e.treeId) : undefined;
  const crop = tree ? crops.find((c) => c.tree.id === tree.id) : undefined;
  const season = e.block ? seasons.find((s) => s.block === e.block) : undefined;
  const today = todayStr();
  const time = e.timed ? new Date(e.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';
  const photos = e.photos || [];
  const caption = `${t(`log.kind.${e.kind}`)} · ${e.treeId || (e.block ? t('common.blockN', { n: e.block }) : '')}`;
  const rows = recordRows(e, { t, lang, today, value });
  const taskTopic = e.kind === 'task' ? SEASON_TASKS[e.rec.task]?.topic : undefined;
  const reportId = typeof (e.rec as { reportId?: unknown }).reportId === 'string' ? ((e.rec as { reportId?: string }).reportId as string) : undefined;

  const remove = async () => {
    if (!window.confirm(t('log.delete.confirm'))) return;
    setBusy(true);
    setError(null);
    try {
      await deleteRecord(e);
      navigate('/reports', { replace: true });
    } catch (err: any) {
      console.error('Delete failed:', err);
      setError(err?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => goBack('/reports')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 min-h-9">
        <ArrowLeft className="w-4 h-4" />
        {t('rep.detail.back')}
      </button>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <article className="min-w-0 lg:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden">
          {photos.length > 0 && <PhotoGrid photos={photos} caption={caption} eager className="aspect-[4/3]" />}
          <div className="p-4 sm:p-5 space-y-3">
            <header className="space-y-0.5">
              <h1 className="text-xl font-bold text-slate-900">
                {e.treeId && (
                  <Link to={treeUrl(e.treeId)} className="font-mono mr-2 hover:text-emerald-700 hover:underline underline-offset-2">
                    {e.treeId}
                  </Link>
                )}
                {t(`log.kind.${e.kind}`)}
              </h1>
              <p className="text-sm text-slate-600 tabular">
                {[tree?.variant, e.block ? t('common.blockN', { n: e.block }) : null].filter(Boolean).join(', ')}
                {tree?.variant || e.block ? '. ' : ''}
                {t('rec.detail.recorded')} {formatShortDate(localDay(e.at))}
                {time ? `, ${time}` : ''}
                {e.who ? `, ${workerLabel(e.who)}` : ''}
              </p>
            </header>

            <dl className="divide-y divide-slate-100 border-y border-slate-100">
              {rows.map(([label, v], i) => (
                <div key={i} className="py-2 grid grid-cols-[minmax(0,10rem)_1fr] gap-3 text-sm">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-slate-900 min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <footer className="px-4 sm:px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            {reportId ? (
              <Link to={reportUrl(reportId)} className="font-semibold text-emerald-700 hover:underline min-h-9 inline-flex items-center">
                {t('rec.detail.fromReport')}
              </Link>
            ) : (
              <span>{e.source === 'whatsapp' ? 'WhatsApp' : t('log.source.webapp')}</span>
            )}
            {canDelete(e.kind) && (
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="min-h-10 px-2.5 -mr-2 rounded-lg inline-flex items-center gap-1.5 font-semibold text-slate-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" aria-hidden />
                {t('rep.del.button')}
              </button>
            )}
          </footer>
          {error && <p role="alert" className="px-4 sm:px-5 pb-3 text-sm text-rose-700">{error}</p>}
        </article>

        <div className="min-w-0 lg:col-span-5 space-y-4">
          {tree && (
            <section className={card} aria-labelledby="rec-tree">
              <div className="flex items-center justify-between gap-2">
                <h2 id="rec-tree" className={h2}>{t('rep.detail.treeNow', { id: tree.id })}</h2>
                <ConditionBadge condition={tree.condition} improving={improvingNow(tree)} size="sm" />
              </div>
              <p>
                <TreeStageCell tree={tree} crop={crop} />
              </p>
              <Link to={treeUrl(tree.id)} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">
                {t('rep.detail.openTree')} <ArrowRight className="w-4 h-4" />
              </Link>
            </section>
          )}

          {season && (
            <section className={card} aria-labelledby="rec-block">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="rec-block" className={h2}>{t('rep.detail.blockNow', { block: season.block })}</h2>
                <span className="flex flex-wrap gap-1">
                  {season.stages.map((st) => (
                    <StagePill key={st} stage={st} />
                  ))}
                </span>
              </div>
              <p className="text-xs text-slate-600 tabular">{season.young ? t('dash.col.young') : blockLine(season, t)}</p>
            </section>
          )}

          {guideOn && taskTopic && TOPIC_BY_ID.get(taskTopic) && (
            <Link to={`/guide/${taskTopic}`} className={`${card} flex items-start gap-3 hover:border-emerald-500`}>
              <BookOpen className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{pick(TOPIC_BY_ID.get(taskTopic)!.title, lang)}</span>
                <span className="block text-xs text-slate-600 mt-0.5">{pick(TOPIC_BY_ID.get(taskTopic)!.summary, lang)}</span>
              </span>
            </Link>
          )}

          {(e.kind === 'harvest' || e.kind === 'count') && (
            <Link to="/harvest" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline">
              <Wheat className="w-4 h-4" />
              {t('rec.detail.harvestPage')}
            </Link>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="rec-others" className="space-y-2.5">
          <h2 id="rec-others" className={h2}>
            {t('rec.detail.others', { where: e.treeId ? t('rep.treeN', { id: e.treeId }) : e.kind === 'rain' ? t('rec.detail.nearbyDays') : t('common.blockN', { n: e.block || '' }) })}
          </h2>
          <RecordGrid>
            {related.map((r) => (
              <RecordCard key={r.key} entry={r} showTree={!e.treeId} />
            ))}
          </RecordGrid>
        </section>
      )}

    </div>
  );
};

/** What the record holds, as label / value rows. */
function recordRows(
  e: LogEntry,
  { t, lang, today, value }: { t: (k: string, v?: Record<string, string | number>) => string; lang: 'id' | 'en'; today: string; value: (f: string, v: unknown) => string }
): Array<[string, React.ReactNode]> {
  const rows: Array<[string, React.ReactNode]> = [];
  const note = (n?: string) => n && rows.push([t('common.notes'), <span className="whitespace-pre-line">{n}</span>]);
  switch (e.kind) {
    case 'bloom':
      rows.push([t('rec.f.bloomDate'), formatShortDate(e.rec.date)], [t('rec.f.part'), t(`guide.part.${e.rec.part}`)], [t('rec.f.daysSince'), String(diffDays(today, e.rec.date))]);
      note(e.rec.note);
      break;
    case 'count':
      rows.push(
        [t('rec.f.countStage'), t(`crop.stage.${e.rec.stage}`)],
        [t('rec.f.count'), <strong className="tabular">{e.rec.count}</strong>],
        [t('rec.f.wave'), formatShortDate(e.rec.season)],
        [t('rec.f.countedOn'), formatShortDate(e.rec.date)]
      );
      note(e.rec.note);
      break;
    case 'harvest': {
      const h = e.rec;
      rows.push([t('rec.f.fruits'), <strong className="tabular">{h.fruits}</strong>]);
      if (h.weightKg) rows.push([t('rec.f.weight'), `${h.weightKg} kg`]);
      const graded = GRADES.filter((g) => h.grades?.[g]);
      if (graded.length) rows.push([t('rec.f.grades'), graded.map((g) => `${t(`grade.${g}`)} ${h.grades![g]}`).join(' · ')]);
      if (h.problems?.length) rows.push([t('rec.f.problems'), `${h.problems.map((p) => t(`rec.hv.p.${p}`)).join(', ')}${h.problemFruits ? ` (${t('log.s.fruit', { n: h.problemFruits })})` : ''}`]);
      if (h.variant) rows.push([t('common.variant'), h.variant]);
      rows.push([t('rec.f.pickedOn'), formatShortDate(h.date)]);
      if (h.floweredOn) rows.push([t('rec.f.daysFromBloom'), `${h.daysFromBloom ?? diffDays(h.date, h.floweredOn)} (${formatShortDate(h.floweredOn)})`]);
      break;
    }
    case 'task':
      rows.push(
        [t('rec.f.task'), SEASON_TASKS[e.rec.task] ? pick(SEASON_TASKS[e.rec.task].title, lang) : e.rec.task],
        [t('common.block'), e.rec.block],
        [t('rec.f.season'), formatShortDate(e.rec.season)],
        [t('rec.f.doneOn'), formatShortDate(e.rec.date)]
      );
      break;
    case 'rain':
      rows.push([t('rec.f.date'), formatShortDate(e.rec.date)], [t('rec.f.rain'), <strong className="tabular">{e.rec.rainMm} mm</strong>]);
      break;
    case 'treeData': {
      for (const [f, c] of Object.entries(e.rec.changes || {})) {
        if (f === 'active') {
          rows.push([t('rec.f.change'), c.to === false ? t('log.s.archived') : t('log.s.restored')]);
          continue;
        }
        const label = FIELD_KEY[f] ? t(FIELD_KEY[f]) : f;
        rows.push([
          label,
          TEXT_FIELDS.has(f) ? (
            <span className="block space-y-1">
              <span className="block text-slate-500 line-through whitespace-pre-line">{value(f, c.from)}</span>
              <span className="block whitespace-pre-line">{value(f, c.to)}</span>
            </span>
          ) : (
            <span className="tabular">
              {value(f, c.from)} → <strong>{value(f, c.to)}</strong>
            </span>
          ),
        ]);
      }
      const x = e.rec as TreeEdit & { reportId?: string };
      const reasonKey =
        x.reason === 'review' ? 'rec.f.reason.review' : x.reason === 'review-dismissed' ? 'rec.f.reason.dismissed' : x.reason === 'report-deleted' ? 'rec.f.reason.deleted' : null;
      if (reasonKey) {
        rows.push([
          t('rec.f.reason'),
          // A deleted report has no page left to open.
          x.reportId && x.reason !== 'report-deleted' ? (
            <Link to={reportUrl(x.reportId)} className="font-semibold text-emerald-700 hover:underline">
              {t(reasonKey)}
            </Link>
          ) : (
            t(reasonKey)
          ),
        ]);
      }
      break;
    }
  }
  return rows;
}

const Notice: React.FC<{ text: string }> = ({ text }) => {
  const { t } = useT();
  return (
    <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-3">
      <p className="text-sm text-slate-700">{text}</p>
      <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline">
        <ArrowLeft className="w-4 h-4" />
        {t('rep.detail.back')}
      </Link>
    </div>
  );
};
