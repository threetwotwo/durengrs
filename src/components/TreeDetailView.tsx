import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Archive, ArchiveRestore, ArrowLeft, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '../i18n';
import { formatDate, normalizeTimestamp, useFarm } from '../context/FarmContext';
import { db, parseReportDoc } from '../lib/firebase';
import { navigate, treeUrl, treesUrl } from '../lib/router';
import { formatShortDate } from '../lib/treatments';
import { improvingNow } from '../lib/trees';
import { restoreTree } from '../lib/fieldData';
import { buildFieldLog, type TreeEdit } from '../lib/fieldLog';
import { foldFiledRecords } from '../lib/feed';
import type { TreeReport } from '../types';
import { ConditionBadge } from './ConditionBadge';
import { Link } from './Link';
import { HistoryItem } from './Record';
import { TreeGuideSection } from './GuideWidgets';
import { TreeCropCard } from './CropWidgets';
import { TreeStageCell } from './StageBoard';
import { useCrops } from './useCrops';
import { ArchiveTreeSheet } from './ArchiveTreeSheet';
import { TreeProblems } from './Problems';
import { TreeDetailsForm } from './TreeDetailsForm';

/** Edits a person made by hand; those the reports made (reason 'report', reviews) are already on the reports. */
const BY_REPORT = new Set(['report', 'review', 'review-dismissed', 'ai-urgent']);

/**
 * One tree:
 *   header       ID (type another to go there), variety, block, health, stage; previous / next tree
 *   history      one line of everything that happened to it, newest first: reports with their photos, counts,
 *                harvests, flowerings, changes made by hand
 *   beside it    its problems, this season's crop, the Guide's advice (Guide on), the block's routines
 *   details      the editable profile and measurements; archive
 */
export const TreeDetailView: React.FC<{ treeId: string; onBack: () => void }> = ({ treeId, onBack }) => {
  const { t } = useT();
  const { trees, allTrees, variants, treatments, cropCounts, harvests, treeBlooms } = useFarm();
  const { crops } = useCrops();
  const tree = allTrees.find((x) => x.id === treeId);
  const archived = tree?.active === false;

  const index = trees.findIndex((x) => x.id === treeId);
  const prevTree = index > 0 ? trees[index - 1] : null;
  const nextTree = index >= 0 && index < trees.length - 1 ? trees[index + 1] : null;

  // This tree's reports, newest first, 20 more at a time.
  const [reportsLimit, setReportsLimit] = useState(20);
  const [reports, setReports] = useState<TreeReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    setReportsLoading(true);
    return onSnapshot(
      query(collection(db, 'reports'), where('treeId', '==', treeId), orderBy('createdAt', 'desc'), limit(reportsLimit + 1)),
      (snap) => {
        const docs = snap.docs.map(parseReportDoc);
        setHasMore(docs.length > reportsLimit);
        setReports(docs.slice(0, reportsLimit));
        setReportsLoading(false);
      },
      (err) => {
        console.error('Failed to load tree reports:', err);
        setReportsLoading(false);
      }
    );
  }, [treeId, reportsLimit]);

  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Changes made to the tree by hand (a tree has few): read once.
  const [edits, setEdits] = useState<TreeEdit[]>([]);
  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(db, 'treeEdits'), where('treeId', '==', treeId)))
      .then((snap) => {
        if (cancelled) return;
        setEdits(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as TreeEdit).filter((e) => !BY_REPORT.has(String(e.reason || ''))));
      })
      .catch((err) => console.error('Tree edits load failed:', err));
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  // The history line: while older reports are unread, other records stop where the reports read so far stop.
  const history = useMemo(() => {
    const all = buildFieldLog({
      reports,
      counts: cropCounts.filter((c) => c.treeId === treeId),
      harvests: harvests.filter((h) => h.treeId === treeId),
      blooms: treeBlooms.filter((b) => b.treeId === treeId),
      edits,
    });
    const from = hasMore && reports.length ? normalizeTimestamp(reports[reports.length - 1].createdAt) : 0;
    return foldFiledRecords(all.filter((e) => e.at >= from));
  }, [reports, cropCounts, harvests, treeBlooms, edits, treeId, hasMore]);
  const blockTreatments = treatments.filter((x) => tree?.block && x.blocks?.includes(tree.block)).slice(0, 5);
  const variantName = variants.find((v) => v.code === tree?.variant)?.name;

  if (!tree) {
    return allTrees.length > 0 ? (
      <div className="bg-white rounded-xl p-8 text-center border border-slate-200 shadow-xs">
        <p className="text-sm font-semibold text-slate-700">{t('tree.notFound', { id: treeId })}</p>
        <button onClick={onBack} className="mt-3 px-4 min-h-10 text-sm font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800">
          {t('tree.backToTrees')}
        </button>
      </div>
    ) : (
      <div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" />
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 sm:px-5 py-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold font-mono tracking-tight text-slate-900">{t('tree.label', { id: tree.id })}</h1>
              <ConditionBadge condition={tree.condition} improving={improvingNow(tree)} size="md" />
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 mt-0.5">
              <span>{[variantName || tree.variant, tree.block ? t('common.blockN', { n: tree.block }) : null].filter(Boolean).join(', ')}</span>
              <TreeStageCell tree={tree} crop={crops.find((c) => c.tree.id === tree.id)} />
            </p>
          </div>
        </div>
        <TreeJump tree={tree} prev={prevTree?.id} next={nextTree?.id} position={index >= 0 ? `${index + 1} / ${trees.length}` : ''} />
      </header>

      {archived && (
        <div className="rounded-xl border border-slate-300 bg-slate-100 p-4 flex flex-wrap items-center justify-between gap-3" role="status">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
              <Archive className="w-4 h-4" />
              {t('tree.arch.banner')}
            </p>
            <p className="text-xs text-slate-700 mt-0.5">
              {[tree.archivedReason ? t(`tree.arch.r.${tree.archivedReason}`) : null, tree.archivedAt ? formatDate(tree.archivedAt) : null, tree.archivedNote || null]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">{t('tree.arch.bannerHint')}</p>
            {restoreError && (
              <p role="alert" className="text-xs text-rose-700 mt-1">
                {restoreError}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={restoring}
            onClick={async () => {
              setRestoring(true);
              setRestoreError(null);
              try {
                await restoreTree(tree.id);
              } catch (e: any) {
                console.error('Restore tree failed:', e);
                setRestoreError(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
              } finally {
                setRestoring(false);
              }
            }}
            className="min-h-11 px-4 rounded-xl bg-white border border-slate-300 text-slate-800 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
          >
            <ArchiveRestore className="w-4 h-4" />
            {restoring ? t('tree.arch.restoring') : t('tree.arch.restore')}
          </button>
        </div>
      )}

      {/* Phones: problems, history, then the crop. Wide screens: the history on the left, the rest beside it. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:grid-rows-[auto_1fr] items-start">
        <div className="min-w-0 lg:col-start-8 lg:col-span-5 lg:row-start-1 empty:hidden">
          <TreeProblems treeId={tree.id} />
        </div>
        <div className="min-w-0 lg:col-start-8 lg:col-span-5 lg:row-start-2 space-y-4 order-last lg:order-none">
          <TreeCropCard tree={tree} />
          <TreeGuideSection tree={tree} reports={reports} />
          {blockTreatments.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4" aria-labelledby="tr-h">
              <h2 id="tr-h" className="text-sm font-bold text-slate-900 mb-2">
                {t('tree.recentTreatments')} <span className="text-slate-500 font-medium">{t('common.blockN', { n: tree.block })}</span>
              </h2>
              <ul className="divide-y divide-slate-100">
                {blockTreatments.map((x) => (
                  <li key={x.id} className="py-2 flex flex-wrap items-baseline gap-x-3 text-sm">
                    <span className="font-semibold text-slate-900">{x.planName}</span>
                    <span className="text-xs text-slate-600">{[formatShortDate(x.date), x.product, x.dose].filter(Boolean).join(', ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* History: one line, newest first */}
        <section className="min-w-0 lg:col-start-1 lg:col-span-7 lg:row-start-1 lg:row-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-4" aria-labelledby="hist-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="hist-h" className="text-sm font-bold text-slate-900">{t('tree.history')}</h2>
            <Link to={`/reports?tree=${encodeURIComponent(tree.id)}&days=365`} className="text-xs font-semibold text-emerald-700 hover:underline min-h-8 inline-flex items-center">
              {t('tree.allRecords')}
            </Link>
          </div>
          {reportsLoading && history.entries.length === 0 ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-40 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : history.entries.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <Calendar className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">{t('tree.noReports', { id: tree.id })}</p>
              <p className="text-xs text-slate-500 mt-1">{t('tree.noReportsHint')}</p>
            </div>
          ) : (
            <ol>
              {history.entries.map((e, i) => (
                <HistoryItem key={e.key} entry={e} filed={history.filed.get(e.key)} last={i === history.entries.length - 1 && !hasMore} />
              ))}
            </ol>
          )}
          {hasMore && (
            <button
              onClick={() => setReportsLimit((n) => n + 20)}
              className="w-full min-h-10 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300"
            >
              {t('tree.loadOlder')}
            </button>
          )}
        </section>
      </div>

      <TreeDetailsForm tree={tree} />

      {!archived && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-wrap items-center justify-between gap-3" aria-labelledby="arch-h">
          <div className="min-w-0">
            <h2 id="arch-h" className="text-sm font-bold text-slate-900">
              {t('tree.arch.sectionTitle')}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">{t('tree.arch.sectionHint')}</p>
          </div>
          <button
            type="button"
            onClick={() => setArchiving(true)}
            className="min-h-11 px-4 rounded-xl bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 text-sm font-semibold inline-flex items-center gap-2"
          >
            <Archive className="w-4 h-4" />
            {t('tree.arch.button')}
          </button>
        </section>
      )}

      {archiving && (
        <ArchiveTreeSheet
          treeId={tree.id}
          onClose={() => setArchiving(false)}
          onDone={() => {
            setArchiving(false);
            navigate(treesUrl());
          }}
        />
      )}
    </div>
  );
};

/**
 * Previous / next tree, and the tree's ID as a field: type another ("A13", or just "13" for the same block) and press
 * Enter to go there.
 */
const TreeJump: React.FC<{ tree: { id: string; block?: string; active?: boolean }; prev?: string; next?: string; position: string }> = ({ tree, prev, next, position }) => {
  const { t } = useT();
  const { allTrees } = useFarm();
  const [value, setValue] = useState(tree.id);
  const [miss, setMiss] = useState<string | null>(null);
  useEffect(() => {
    setValue(tree.id);
    setMiss(null);
  }, [tree.id]);
  const go = () => {
    const raw = value.trim().toUpperCase().replace(/\s+/g, '');
    if (!raw || raw === tree.id) return setValue(tree.id);
    const id = /^\d+$/.test(raw) && tree.block ? `${tree.block}${raw}` : raw;
    const found = allTrees.find((x) => x.id.toUpperCase() === id);
    if (found) navigate(treeUrl(found.id));
    else setMiss(t('tree.jump.none', { id }));
  };
  const arrow = 'min-h-10 min-w-10 flex items-center justify-center rounded text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30';
  return (
    <div className="flex flex-col items-end gap-1">
      <nav className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50" aria-label={t('tree.stepper')}>
        <button onClick={() => prev && navigate(treeUrl(prev), { replace: true })} disabled={!prev} className={arrow} aria-label={prev ? t('tree.prevTree', { id: prev }) : t('tree.firstTree')}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
          className="flex items-center gap-1.5 px-1"
        >
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setMiss(null);
            }}
            onFocus={(e) => e.target.select()}
            onBlur={() => !miss && setValue(tree.id)}
            aria-label={t('tree.jump.label')}
            inputMode="text"
            autoCapitalize="characters"
            spellCheck={false}
            className="w-16 h-8 px-1.5 rounded-md border border-slate-300 bg-white text-center text-sm font-mono font-semibold text-slate-900 focus:outline-2 focus:outline-emerald-500"
          />
          {position && <span className="text-xs font-mono text-slate-500 select-none tabular whitespace-nowrap">{position}</span>}
        </form>
        <button onClick={() => next && navigate(treeUrl(next), { replace: true })} disabled={!next} className={arrow} aria-label={next ? t('tree.nextTree', { id: next }) : t('tree.lastTree')}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </nav>
      {miss && (
        <p role="alert" className="text-xs text-rose-700">
          {miss}
        </p>
      )}
    </div>
  );
};
