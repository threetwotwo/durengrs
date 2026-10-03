import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useT } from '../i18n';
import { useFarm, formatDateTime, formatDate, normalizeTimestamp } from '../context/FarmContext';
import { DurianTree, TreeCondition, ReportPhoto, TreeReport } from '../types';
import { ConditionBadge } from './ConditionBadge';
import { ReportDate } from './ReportDate';
import { navigate, setNavigationBlocker, treeUrl, treesUrl } from '../lib/router';
import { formatShortDate, toDateStr } from '../lib/treatments';
import { PhotoLightbox, photoItems, type GalleryItem } from './PhotoLightbox';
import {
  db,
  parseReportDoc,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Save,
  Check,
  Calendar,
  User,
  Clock,
  Sparkles,
  RefreshCw,
  ImageIcon,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { TreeGuideSection } from './GuideWidgets';

interface TreeDetailViewProps {
  treeId: string;
  onBack: () => void;
}

const ThumbnailItem: React.FC<{
  photo: ReportPhoto;
  idx: number;
  reportDate: any;
  treeId: string;
  onOpen: (url: string, caption: string) => void;
}> = ({ photo, idx, reportDate, treeId, onOpen }) => {
  const { t } = useT();
  const [loadFailed, setLoadFailed] = useState(false);
  const src = photo.thumb || photo.url;
  const caption = t('tree.photoCaption', { id: treeId, n: idx + 1, date: formatDateTime(reportDate) });

  return (
    <div
      onClick={() => onOpen(photo.url, caption)}
      className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer group hover:ring-2 hover:ring-emerald-500 transition-all shadow-2xs flex items-center justify-center"
    >
      {!loadFailed ? (
        <img
          src={src}
          alt={t('tree.photoAlt', { n: idx + 1 })}
          loading="lazy"
          decoding="async"
          width="120"
          height="120"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          onError={() => setLoadFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-slate-500 hover:text-emerald-700 bg-slate-50">
          <ImageIcon className="w-5 h-5 mb-1 text-slate-400" />
          <span className="text-xs font-semibold">{t('tree.photoView', { n: idx + 1 })}</span>
        </div>
      )}

      <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
        <ExternalLink className="w-4 h-4 drop-shadow-sm" />
      </div>
    </div>
  );
};

export const TreeDetailView: React.FC<TreeDetailViewProps> = ({ treeId, onBack }) => {
  const { t } = useT();
  const { trees, variants, updateTree, treatments } = useFarm();

  const tree = trees.find((t) => t.id === treeId);
  const blockTreatments = treatments.filter((x) => tree?.block && x.blocks?.includes(tree.block)).slice(0, 5);

  // Stepper: Previous / Next tree in current inventory
  const currentIndex = trees.findIndex((t) => t.id === treeId);
  const prevTree = currentIndex > 0 ? trees[currentIndex - 1] : null;
  const nextTree = currentIndex < trees.length - 1 ? trees[currentIndex + 1] : null;

  // Local state for editable fields - storing strings so empty inputs remain empty
  const [formData, setFormData] = useState({
    variant: '',
    block: '',
    condition: 'not_assessed' as TreeCondition,
    conditionNotes: '',
    canopySize: '',
    trunkSize: '',
    floweringBranches: '',
    floweringClusters: '',
    estimatedFruitCount: '',
    notes: '',
    supplier: '',
  });

  const [initialData, setInitialData] = useState({ ...formData });

  // Targeted live stream for THIS tree's reports (with pagination limit)
  const [reportsLimit, setReportsLimit] = useState(20);
  const [treeReports, setTreeReports] = useState<TreeReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [hasMoreReports, setHasMoreReports] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Lightbox
  const [gallery, setGallery] = useState<{ items: GalleryItem[]; index: number } | null>(null);

  // Sync tree data into form state
  useEffect(() => {
    if (tree) {
      const init = {
        variant: tree.variant || '',
        block: tree.block || '',
        condition: tree.condition || 'not_assessed',
        conditionNotes: tree.conditionNotes || '',
        canopySize: tree.canopySize !== undefined && tree.canopySize !== null ? String(tree.canopySize) : '',
        trunkSize: tree.trunkSize !== undefined && tree.trunkSize !== null ? String(tree.trunkSize) : '',
        floweringBranches: tree.floweringBranches !== undefined && tree.floweringBranches !== null ? String(tree.floweringBranches) : '',
        floweringClusters: tree.floweringClusters !== undefined && tree.floweringClusters !== null ? String(tree.floweringClusters) : '',
        estimatedFruitCount: tree.estimatedFruitCount !== undefined && tree.estimatedFruitCount !== null ? String(tree.estimatedFruitCount) : '',
        notes: tree.notes || '',
        supplier: tree.supplier || '',
      };
      setFormData(init);
      setInitialData(init);
    }
  }, [tree, treeId]);

  // Stream targeted reports for this tree
  useEffect(() => {
    setReportsLoading(true);
    const q = query(
      collection(db, 'reports'),
      where('treeId', '==', treeId),
      orderBy('createdAt', 'desc'),
      limit(reportsLimit + 1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(parseReportDoc);
        if (docs.length > reportsLimit) {
          setHasMoreReports(true);
          setTreeReports(docs.slice(0, reportsLimit));
        } else {
          setHasMoreReports(false);
          setTreeReports(docs);
        }
        setReportsLoading(false);
      },
      (err) => {
        console.error('Failed to load tree reports:', err);
        setReportsLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, `reports?treeId=${treeId}`);
        } catch {}
      }
    );

    return () => unsubscribe();
  }, [treeId, reportsLimit]);

  // Detect unsaved changes (Requirement 17)
  const hasUnsavedChanges = useMemo(() => {
    return (
      formData.variant !== initialData.variant ||
      formData.block !== initialData.block ||
      formData.condition !== initialData.condition ||
      formData.conditionNotes !== initialData.conditionNotes ||
      formData.canopySize !== initialData.canopySize ||
      formData.trunkSize !== initialData.trunkSize ||
      formData.floweringBranches !== initialData.floweringBranches ||
      formData.floweringClusters !== initialData.floweringClusters ||
      formData.estimatedFruitCount !== initialData.estimatedFruitCount ||
      formData.notes !== initialData.notes ||
      formData.supplier !== initialData.supplier
    );
  }, [formData, initialData]);

  // Prompt before window unload if unsaved changes exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Guard every way of leaving (tabs, Back button, prev/next, links) while there are unsaved edits.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    setNavigationBlocker(() =>
      window.confirm(t('tree.confirmDiscard'))
    );
    return () => setNavigationBlocker(null);
  }, [hasUnsavedChanges]);

  // Prev/next replace the history entry, so Back returns to the list instead of walking through trees.
  const safeNavigate = useCallback((action: () => void) => action(), []);

  // Oldest first. Each report may carry several photos; use the small thumb when the bot stored one.
  const historyPhotos = treeReports
    .slice()
    .reverse()
    .flatMap((r) =>
      (r.photos || []).map((ph) => ({
        id: r.id,
        url: ph.url,
        thumb: ph.thumb || ph.url,
        at: r.createdAt,
        date: toDateStr(new Date(normalizeTimestamp(r.createdAt) || Date.now())),
      }))
    );
  const conditionChanges = treeReports
    .slice()
    .reverse()
    .filter((r) => r.conditionChanged && r.conditionAfter)
    .map((r) => ({
      id: r.id,
      after: r.conditionAfter as string,
      date: toDateStr(new Date(normalizeTimestamp(r.createdAt) || Date.now())),
    }));

  if (!tree && trees.length > 0) {
    return (
      <div className="bg-white rounded-xl p-8 text-center border border-slate-200 shadow-xs">
        <p className="text-sm font-semibold text-slate-700">{t('tree.notFound', { id: treeId })}</p>
        <button
          onClick={onBack}
          className="mt-3 px-4 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800"
        >
          {t('tree.backToTrees')}
        </button>
      </div>
    );
  }

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tree || !hasUnsavedChanges) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      // Build draft payload with proper types (empty strings converted to undefined so deleteField() removes them)
      const parseNumberField = (val: string): number | undefined => {
        const trimmed = val.trim();
        if (trimmed === '') return undefined;
        const n = Number(trimmed);
        return isNaN(n) ? undefined : n;
      };

      const draft: Partial<DurianTree> = {
        variant: formData.variant.trim(),
        block: formData.block.trim(),
        condition: formData.condition,
        conditionNotes: formData.conditionNotes.trim(),
        canopySize: formData.canopySize.trim() !== '' ? formData.canopySize.trim() : undefined,
        trunkSize: parseNumberField(formData.trunkSize),
        floweringBranches: parseNumberField(formData.floweringBranches),
        floweringClusters: parseNumberField(formData.floweringClusters),
        estimatedFruitCount: parseNumberField(formData.estimatedFruitCount),
        notes: formData.notes.trim(),
        supplier: formData.supplier.trim(),
      };

      await updateTree(tree, draft);

      setInitialData({ ...formData });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setSaveError(t('tree.saveFailed', { msg: err.message }));
    } finally {
      setIsSaving(false);
    }
  };

  // Labels come from ConditionBadge; only the ids are needed here.
  const conditions: { id: TreeCondition }[] = [
    { id: 'healthy' },
    { id: 'minor' },
    { id: 'emergency' },
    { id: 'not_assessed' },
  ];

  const currentVariant = variants.find((v) => v.code === formData.variant);

  const maskPhone = (phone?: string): string => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 4) {
      return `••••${digits.slice(-4)}`;
    }
    return phone;
  };

  return (
    <div className="space-y-5">
      {/* Top Header Bar */}
      <div className="sticky top-14 z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-4 sm:px-5 py-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => safeNavigate(onBack)}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title={t('common.back')}
            aria-label={t('common.back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold font-mono tracking-tight text-slate-900">
                {t('tree.label', { id: treeId })} · {tree?.variant || formData.variant || 'MK'}
              </h1>
              <ConditionBadge condition={formData.condition} size="md" />
            </div>
            <p className="text-xs text-slate-600 mt-0.5 font-sans">
              {t('common.blockN', { n: formData.block || '—' })}{currentVariant ? ` · ${currentVariant.name}` : ''}
            </p>
          </div>
        </div>

        {/* Stepper + Save Button */}
        <div className="flex items-center gap-2.5 self-end sm:self-center">
          {/* Tree Stepper */}
          <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50">
            <button
              onClick={() => prevTree && navigate(treeUrl(prevTree.id), { replace: true })}
              disabled={!prevTree}
              className="min-h-10 min-w-10 flex items-center justify-center rounded text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title={prevTree ? t('tree.prevTree', { id: prevTree.id }) : t('tree.firstTree')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-medium px-2 text-slate-700 select-none">
              {currentIndex + 1} / {trees.length}
            </span>
            <button
              onClick={() => nextTree && navigate(treeUrl(nextTree.id), { replace: true })}
              disabled={!nextTree}
              className="min-h-10 min-w-10 flex items-center justify-center rounded text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title={nextTree ? t('tree.nextTree', { id: nextTree.id }) : t('tree.lastTree')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Save Button (Requirement 17: Disabled & neutral until changed, with "Unsaved changes" label) */}
          <button
            onClick={() => handleSave()}
            disabled={!hasUnsavedChanges || isSaving}
            className={`inline-flex items-center gap-2 px-4 min-h-11 rounded-lg text-sm font-semibold transition-all shadow-xs ${
              hasUnsavedChanges
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/20'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{t('tree.saving')}</span>
              </>
            ) : saveSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{t('tree.savedBang')}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{hasUnsavedChanges ? t('tree.saveChanges') : t('tree.saved')}</span>
                {hasUnsavedChanges && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                )}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Unsaved changes alert banner */}
      {hasUnsavedChanges && (
        <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-center justify-between gap-2 shadow-2xs animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{t('tree.unsavedBanner')}</span>
          </div>
          <button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-semibold text-xs transition-colors shrink-0"
          >
            {t('tree.saveNow')}
          </button>
        </div>
      )}

      {saveError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl">
          {saveError}
        </div>
      )}

      {/* History: condition changes and photos, oldest to newest, so progress or decline is easy to see */}
      {(historyPhotos.length > 0 || conditionChanges.length > 0) && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3" aria-labelledby="hist-h">
          <h2 id="hist-h" className="text-sm font-bold text-slate-900">{t('tree.history')}</h2>
          {conditionChanges.length > 0 && (
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
              {conditionChanges.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2">
                  {i > 0 && <span className="text-slate-300" aria-hidden="true">→</span>}
                  <span className="flex flex-col items-start">
                    <ConditionBadge condition={c.after} size="sm" />
                    <span className="text-xs text-slate-600 mt-0.5 tabular">{formatShortDate(c.date)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {historyPhotos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {historyPhotos.map((ph, i) => (
                <button
                  key={`${ph.id}-${i}`}
                  onClick={() => setGallery({ items: historyPhotos.map((h) => ({ url: h.url, caption: t('tree.historyPhotoCaption', { id: treeId, date: formatDateTime(h.at) }) })), index: i })}
                  className="shrink-0 w-[88px] text-left group"
                  aria-label={t('tree.historyPhotoAria', { date: formatShortDate(ph.date) })}
                >
                  <img src={ph.thumb} alt="" loading="lazy" decoding="async" width="88" height="88" className="w-[88px] h-[88px] object-cover rounded-lg border border-slate-200 group-hover:ring-2 group-hover:ring-emerald-500" />
                  <span className="block text-xs text-slate-600 mt-1 tabular">{formatShortDate(ph.date)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {tree && <TreeGuideSection tree={tree} reports={treeReports} />}

      {/* Main Grid: Form Details (Left 7 cols) & Inspection History (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Details */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-5">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-sm font-bold text-slate-900">{t('tree.profileTitle')}</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {t('tree.profileHint')}
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {/* Condition Picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {t('tree.condition')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {conditions.map((c) => {
                  const isSelected = formData.condition === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, condition: c.id })}
                      className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        isSelected
                          ? c.id === 'healthy'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                            : c.id === 'minor'
                            ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20'
                            : c.id === 'emergency'
                            ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20'
                            : 'bg-slate-200 border-slate-400 text-slate-800 ring-2 ring-slate-400/20'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <ConditionBadge condition={c.id} size="sm" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Condition Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('tree.conditionNotes')}
              </label>
              <input
                type="text"
                value={formData.conditionNotes}
                onChange={(e) => setFormData({ ...formData, conditionNotes: e.target.value })}
                placeholder={t('tree.conditionNotesPlaceholder')}
                className="w-full min-h-11 text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none placeholder:text-slate-500"
              />
            </div>

            {/* Block & Variant */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('common.block')}
                </label>
                <input
                  type="text"
                  value={formData.block}
                  onChange={(e) => setFormData({ ...formData, block: e.target.value })}
                  placeholder={t('tree.blockPlaceholder')}
                  className="w-full min-h-11 text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('common.variant')}
                </label>
                <select
                  value={formData.variant}
                  onChange={(e) => setFormData({ ...formData, variant: e.target.value })}
                  className="w-full min-h-11 text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">{t('tree.selectVariant')}</option>
                  {variants.map((v) => (
                    <option key={v.code} value={v.code}>
                      {v.code} - {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Supplier & Planting Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('tree.supplier')}
                </label>
                <input
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder={t('tree.supplierPlaceholder')}
                  className="w-full min-h-11 text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('tree.datePlanted')}
                </label>
                <div className="text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-sans text-slate-700 flex items-center justify-between">
                  <span>{formatDate(tree?.datePlanted)}</span>
                  <span className="text-xs text-slate-500">{t('tree.recorded')}</span>
                </div>
              </div>
            </div>

            {/* Biometrics & Yield (Requirement 16: Canopy Spread (cm)) */}
            <div className="pt-2 border-t border-slate-200">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-3">
                {t('tree.biometrics')}
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-xs text-slate-700 mb-1 font-medium">
                    {t('field.trunk')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.trunkSize}
                    onChange={(e) => setFormData({ ...formData, trunkSize: e.target.value })}
                    placeholder="—"
                    className="w-full min-h-11 text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono tabular-nums placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-700 mb-1 font-medium">
                    {t('field.canopy')}
                  </label>
                  <input
                    type="text"
                    value={formData.canopySize}
                    onChange={(e) => setFormData({ ...formData, canopySize: e.target.value })}
                    placeholder="—"
                    className="w-full min-h-11 text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono tabular-nums placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-700 mb-1 font-medium">
                    {t('field.clusters')}
                  </label>
                  <input
                    type="number"
                    value={formData.floweringClusters}
                    onChange={(e) => setFormData({ ...formData, floweringClusters: e.target.value })}
                    placeholder="—"
                    className="w-full min-h-11 text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono tabular-nums placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-emerald-800 mb-1">
                    {t('field.fruits')}
                  </label>
                  <input
                    type="number"
                    value={formData.estimatedFruitCount}
                    onChange={(e) => setFormData({ ...formData, estimatedFruitCount: e.target.value })}
                    placeholder="—"
                    className="w-full min-h-11 text-sm px-3 py-2 bg-emerald-50/50 border border-emerald-300 rounded-lg font-mono tabular-nums font-bold text-emerald-800 focus:bg-white placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>

            {/* General Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('tree.notes')}
              </label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t('tree.notesPlaceholder')}
                className="w-full min-h-11 text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none placeholder:text-slate-500"
              />
            </div>
          </form>
        </div>

        {/* Right Column: Targeted Inspection Log (Requirement 7 & 15) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col space-y-4">
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {t('tree.logTitle', { n: treeReports.length })}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {t('tree.logSubtitle', { id: treeId })}
              </p>
            </div>
            {treeReports.length > 0 && (
              <span className="text-xs font-sans text-slate-500">
                {t('tree.latest', { date: formatDate(treeReports[0].createdAt) })}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto max-h-[640px] pr-1">
            {reportsLoading ? (
              <div className="space-y-4 pl-7">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : treeReports.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">{t('tree.noReports', { id: treeId })}</p>
                <p className="text-xs text-slate-500 mt-1">{t('tree.noReportsHint')}</p>
              </div>
            ) : (
              <div className="relative pl-7 space-y-4">
                {/* Continuous timeline spine */}
                <div
                  aria-hidden="true"
                  className="absolute left-[11px] top-2.5 bottom-2.5 w-0.5 bg-slate-200"
                />

                {treeReports.map((report) => {
                  const photos = report.photos || [];
                  const workerMasked = maskPhone(report.workerPhone);

                  return (
                    <div key={report.id} className="relative pb-1">
                      {/* Timeline node perfectly centered and horizontally aligned with the date */}
                      <div
                        aria-hidden="true"
                        className="absolute -left-7 top-0 w-6 h-5 flex items-center justify-center pointer-events-none"
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-white ring-2 ring-emerald-500 shadow-2xs" />
                      </div>

                      {/* 1. Report date on top of the card - aligns with timeline node */}
                      <div className="flex items-center justify-between text-xs text-slate-700 font-sans h-5 mb-2 pl-0.5">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                          <ReportDate value={report.createdAt} />
                        </div>

                        {report.conditionAfter && (
                          <ConditionBadge condition={report.conditionAfter} size="sm" />
                        )}
                      </div>

                      {/* Report Card (Requirement 15: Removed repeated "Tree A1 · MK / Block A") */}
                      <div className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs space-y-2.5 transition-all">
                        {/* Condition changed indicator */}
                        {report.conditionChanged && (
                          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-1.5 text-xs text-amber-900 font-medium">
                            <span>{t('cond.changed')}:</span>
                            <ConditionBadge condition={report.conditionBefore || 'not_assessed'} size="sm" />
                            <span>→</span>
                            <ConditionBadge condition={report.conditionAfter || 'minor'} size="sm" />
                          </div>
                        )}

                        {/* Worker identifier */}
                        {workerMasked && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-mono">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>{workerMasked}</span>
                          </div>
                        )}

                        {/* Description */}
                        {report.description && (
                          <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            {report.description}
                          </p>
                        )}

                        {/* Photo thumbnails */}
                        {photos.length > 0 && (
                          <div className="pt-0.5">
                            <span className="text-xs font-semibold text-slate-600 block mb-1.5">
                              {t('tree.reportPhotos', { n: photos.length })}
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                              {photos.map((photo, pIdx) => (
                                <ThumbnailItem
                                  key={pIdx}
                                  photo={photo}
                                  idx={pIdx}
                                  reportDate={report.createdAt}
                                  treeId={treeId}
                                  onOpen={() => setGallery({ items: photoItems(photos, treeId, report.createdAt), index: pIdx })}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Load More Button (Requirement 7) */}
                {hasMoreReports && (
                  <div className="pt-2 text-center">
                    <button
                      onClick={() => setReportsLimit((prev) => prev + 20)}
                      className="px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                    >
                      {t('tree.loadOlder')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Routine work applied to this tree's block */}
      {blockTreatments.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4" aria-labelledby="tr-h">
          <h2 id="tr-h" className="text-sm font-bold text-slate-900 mb-2">
            {t('tree.recentTreatments')} <span className="text-slate-500 font-medium">· {t('common.blockN', { n: tree?.block ?? '' })}</span>
          </h2>
          <ul className="divide-y divide-slate-100">
            {blockTreatments.map((x) => (
              <li key={x.id} className="py-2 flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-semibold text-slate-900">{x.planName}</span>
                <span className="text-xs text-slate-600">
                  {formatShortDate(x.date)}
                  {x.product ? ` · ${x.product}` : ''}
                  {x.dose ? ` · ${x.dose}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Lightbox Modal */}
      {gallery && <PhotoLightbox items={gallery.items} index={gallery.index} onClose={() => setGallery(null)} />}
    </div>
  );
};
