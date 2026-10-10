import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Archive, ArchiveRestore, ArrowLeft, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '../i18n';
import { formatDate, formatDateTime, normalizeTimestamp, useFarm } from '../context/FarmContext';
import { db, parseReportDoc } from '../lib/firebase';
import { navigate, treeUrl, treesUrl } from '../lib/router';
import { formatShortDate, toDateStr } from '../lib/treatments';
import { improvingNow } from '../lib/trees';
import { restoreTree } from '../lib/fieldData';
import type { TreeReport } from '../types';
import { ConditionBadge } from './ConditionBadge';
import { ReportCard } from './ReportCard';
import { Link } from './Link';
import { PhotoLightbox, type GalleryItem } from './PhotoLightbox';
import { TreeGuideSection } from './GuideWidgets';
import { TreeCropCard } from './CropWidgets';
import { TreeStageCell } from './StageBoard';
import { useCrops } from './useCrops';
import { ArchiveTreeSheet } from './ArchiveTreeSheet';
import { TreeProblems } from './Problems';
import { TreeDetailsForm } from './TreeDetailsForm';

/**
 * One tree, top to bottom:
 *   header       ID, variety, block, health, stage; previous / next tree
 *   problems     what is wrong with it, what was done, when to check again (cases)
 *   history      every photo oldest to newest, then the reports themselves
 *   crop         this season's flowering, counts and harvest; the Guide's advice (Guide on)
 *   details      the editable profile and measurements; archive
 */
export const TreeDetailView: React.FC<{ treeId: string; onBack: () => void }> = ({ treeId, onBack }) => {
  const { t } = useT();
  const { trees, allTrees, variants, treatments } = useFarm();
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

  const [gallery, setGallery] = useState<{ items: GalleryItem[]; index: number } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Every photo, oldest first, so progress or decline is easy to see.
  const photos = useMemo(
    () =>
      reports
        .slice()
        .reverse()
        .flatMap((r) =>
          (r.photos || []).map((ph) => ({ url: ph.url, thumb: ph.thumb || ph.medium || ph.url, at: r.createdAt, date: toDateStr(new Date(normalizeTimestamp(r.createdAt) || Date.now())) }))
        ),
    [reports]
  );
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
              <span>{[variantName || tree.variant, tree.block ? t('common.blockN', { n: tree.block }) : null].filter(Boolean).join(' · ')}</span>
              <TreeStageCell tree={tree} crop={crops.find((c) => c.tree.id === tree.id)} />
            </p>
          </div>
        </div>
        {!archived && (
          <nav className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50" aria-label={t('tree.stepper')}>
            <button
              onClick={() => prevTree && navigate(treeUrl(prevTree.id), { replace: true })}
              disabled={!prevTree}
              className="min-h-10 min-w-10 flex items-center justify-center rounded text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30"
              aria-label={prevTree ? t('tree.prevTree', { id: prevTree.id }) : t('tree.firstTree')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-medium px-2 text-slate-700 select-none tabular">
              {index + 1} / {trees.length}
            </span>
            <button
              onClick={() => nextTree && navigate(treeUrl(nextTree.id), { replace: true })}
              disabled={!nextTree}
              className="min-h-10 min-w-10 flex items-center justify-center rounded text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30"
              aria-label={nextTree ? t('tree.nextTree', { id: nextTree.id }) : t('tree.lastTree')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </nav>
        )}
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

      <TreeProblems treeId={tree.id} />

      {/* History: every photo oldest to newest, then the reports themselves */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3" aria-labelledby="hist-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="hist-h" className="text-sm font-bold text-slate-900">
            {t('tree.history')} {reports.length > 0 && <span className="text-slate-500 font-medium tabular">({reports.length}{hasMore ? '+' : ''})</span>}
          </h2>
          <Link to={`/reports?view=log&tree=${encodeURIComponent(tree.id)}&days=365`} className="text-xs font-semibold text-emerald-700 hover:underline min-h-8 inline-flex items-center">
            {t('tree.allRecords')}
          </Link>
        </div>
        {photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {photos.map((ph, i) => (
              <button
                key={`${ph.url}-${i}`}
                onClick={() => setGallery({ items: photos.map((h) => ({ url: h.url, caption: t('tree.historyPhotoCaption', { id: tree.id, date: formatDateTime(h.at) }) })), index: i })}
                className="shrink-0 w-[88px] text-left group"
                aria-label={t('tree.historyPhotoAria', { date: formatShortDate(ph.date) })}
              >
                <img src={ph.thumb} alt="" loading="lazy" decoding="async" width="88" height="88" className="w-[88px] h-[88px] object-cover rounded-lg border border-slate-200 group-hover:ring-2 group-hover:ring-emerald-500" />
                <span className="block text-xs text-slate-600 mt-1 tabular">{formatShortDate(ph.date)}</span>
              </button>
            ))}
          </div>
        )}
        {reportsLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-28 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
            <Calendar className="w-7 h-7 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">{t('tree.noReports', { id: tree.id })}</p>
            <p className="text-xs text-slate-500 mt-1">{t('tree.noReportsHint')}</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {reports.map((r) => (
              <ReportCard key={r.id} report={r} tree={tree} showTree={false} size="sm" />
            ))}
          </div>
        )}
        {hasMore && (
          <button
            onClick={() => setReportsLimit((n) => n + 20)}
            className="w-full min-h-10 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200"
          >
            {t('tree.loadOlder')}
          </button>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <TreeCropCard tree={tree} />
        <TreeGuideSection tree={tree} reports={reports} />
      </div>

      {blockTreatments.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4" aria-labelledby="tr-h">
          <h2 id="tr-h" className="text-sm font-bold text-slate-900 mb-2">
            {t('tree.recentTreatments')} <span className="text-slate-500 font-medium">· {t('common.blockN', { n: tree.block })}</span>
          </h2>
          <ul className="divide-y divide-slate-100">
            {blockTreatments.map((x) => (
              <li key={x.id} className="py-2 flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-semibold text-slate-900">{x.planName}</span>
                <span className="text-xs text-slate-600">{[formatShortDate(x.date), x.product, x.dose].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
      {gallery && <PhotoLightbox items={gallery.items} index={gallery.index} onClose={() => setGallery(null)} />}
    </div>
  );
};
