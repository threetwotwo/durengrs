import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, RefreshCw, Save } from 'lucide-react';
import { useT } from '../i18n';
import { useFarm } from '../context/FarmContext';
import type { DurianTree, TreeCondition } from '../types';
import { setNavigationBlocker } from '../lib/router';
import { toDateStr } from '../lib/treatments';
import { TREE_LIMITS, checkTreeForm, plantedDateStr } from '../lib/trees';
import { parseNum } from '../lib/num';
import { ConditionBadge } from './ConditionBadge';

/**
 * The tree's details, editable: condition, block and variety, supplier, planting date, measurements, notes.
 * Only changed fields are checked; a change arriving from WhatsApp while someone is typing keeps their edits and says
 * what changed; leaving with unsaved edits asks first. Every saved change is logged in the tree's history.
 */

/** i18n label per form field, for the "also changed elsewhere" notice. */
const FIELD_LABEL: Record<string, string> = {
  variant: 'common.variant',
  block: 'common.block',
  condition: 'common.condition',
  conditionNotes: 'tree.conditionNotes',
  canopySize: 'field.canopy',
  trunkSize: 'field.trunk',
  floweringBranches: 'field.branches',
  floweringClusters: 'field.clusters',
  estimatedFruitCount: 'field.fruits',
  notes: 'tree.notes',
  supplier: 'tree.supplier',
  datePlanted: 'tree.datePlanted',
};

export const TreeDetailsForm: React.FC<{ tree: DurianTree }> = ({ tree }) => {
  const { t } = useT();
  const { variants, updateTree } = useFarm();
  const treeId = tree.id;

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
    datePlanted: '',
  });

  const [initialData, setInitialData] = useState({ ...formData });
  type FormState = typeof formData;
  // Latest values for the live-update merge below (the effect must not depend on every keystroke).
  const formRef = useRef(formData);
  const initialRef = useRef(initialData);
  formRef.current = formData;
  initialRef.current = initialData;
  /** Set when the tree changed in the database while the form had unsaved edits. */
  const [remoteUpdate, setRemoteUpdate] = useState<{ conflicts: string[] } | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
        datePlanted: plantedDateStr(tree.datePlanted),
      };
      const form = formRef.current;
      const base = initialRef.current;
      const keys = Object.keys(init) as Array<keyof FormState>;
      const edited = keys.filter((k) => form[k] !== base[k]);
      if (edited.length === 0) {
        setFormData(init);
        setInitialData(init);
        return;
      }
      // Unsaved edits: refresh the fields the user hasn't touched, keep their edits, and say what happened.
      // (A WhatsApp report arriving mid-edit used to wipe everything typed.)
      const changedRemotely = keys.filter((k) => init[k] !== base[k]);
      if (changedRemotely.length === 0) return;
      const merged = { ...init };
      edited.forEach((k) => ((merged as Record<string, unknown>)[k] = form[k]));
      setFormData(merged);
      setInitialData(init);
      setRemoteUpdate({ conflicts: edited.filter((k) => changedRemotely.includes(k)) });
    }
  }, [tree, treeId]);

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
      formData.supplier !== initialData.supplier ||
      formData.datePlanted !== initialData.datePlanted
    );
  }, [formData, initialData]);

  const formCheck = useMemo(() => checkTreeForm(formData, initialData), [formData, initialData]);
  const fieldError = (f: keyof typeof formCheck.errors) => {
    const e = formCheck.errors[f];
    // Show as soon as a changed value is wrong, so it can be fixed while typing.
    return e && (showErrors || formData[f] !== initialData[f]) ? t(e.key, e.vars) : null;
  };
  const errCls = (f: keyof typeof formCheck.errors) => (fieldError(f) ? ' border-rose-500 bg-rose-50/40' : '');

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

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tree || !hasUnsavedChanges) return;
    if (Object.keys(formCheck.errors).length > 0) {
      setShowErrors(true);
      setSaveError(t('tree.v.fix'));
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      // Build draft payload with proper types (empty strings converted to undefined so deleteField() removes them)
      const parseNumberField = (val: string): number | undefined => {
        const trimmed = val.trim();
        if (trimmed === '') return undefined;
        const n = parseNum(trimmed);
        return isNaN(n) ? undefined : n;
      };
      const canopyText = formData.canopySize.trim();
      const canopyChanged = canopyText !== initialData.canopySize.trim();

      const draft: Partial<DurianTree> = {
        variant: formData.variant.trim(),
        block: formData.block.trim(),
        condition: formData.condition,
        conditionNotes: formData.conditionNotes.trim(),
        // A changed canopy is validated as a number; an untouched old text value is passed through unchanged.
        canopySize: canopyText === '' ? undefined : canopyChanged ? parseNum(canopyText) : canopyText,
        trunkSize: parseNumberField(formData.trunkSize),
        floweringBranches: parseNumberField(formData.floweringBranches),
        floweringClusters: parseNumberField(formData.floweringClusters),
        estimatedFruitCount: parseNumberField(formData.estimatedFruitCount),
        notes: formData.notes.trim(),
        supplier: formData.supplier.trim(),
        ...(formData.datePlanted !== initialData.datePlanted ? { datePlanted: formData.datePlanted } : {}),
      };

      await updateTree(tree, draft);

      setInitialData({ ...formData });
      setRemoteUpdate(null);
      setShowErrors(false);
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


  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-5" aria-labelledby="tf-h">
        <div className="border-b border-slate-200 pb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="tf-h" className="text-sm font-bold text-slate-900">{t('tree.profileTitle')}</h2>
            <p className="text-xs text-slate-600 mt-0.5">{t('tree.profileHint')}</p>
          </div>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={!hasUnsavedChanges || isSaving}
            className={`inline-flex items-center gap-2 px-4 min-h-11 rounded-lg text-sm font-semibold transition-all ${
              hasUnsavedChanges ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? t('tree.saving') : saveSuccess ? t('tree.savedBang') : hasUnsavedChanges ? t('tree.saveChanges') : t('tree.saved')}</span>
          </button>
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
              <label htmlFor="tf-planted" className="block text-xs font-semibold text-slate-700 mb-1">
                {t('tree.datePlanted')}
              </label>
              <input
                id="tf-planted"
                type="date"
                min="1990-01-01"
                max={toDateStr(new Date())}
                value={formData.datePlanted}
                onChange={(e) => setFormData({ ...formData, datePlanted: e.target.value })}
                aria-invalid={Boolean(fieldError('datePlanted'))}
                aria-describedby="tf-planted-msg"
                className={`w-full min-h-11 text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none${errCls('datePlanted')}`}
              />
              <p id="tf-planted-msg" className={`text-xs mt-0.5 ${fieldError('datePlanted') ? 'text-rose-700' : 'text-slate-500'}`}>
                {fieldError('datePlanted') || t('tree.datePlantedHint')}
              </p>
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
                  min={TREE_LIMITS.trunkSize.min}
                  max={TREE_LIMITS.trunkSize.max}
                  value={formData.trunkSize}
                  onChange={(e) => setFormData({ ...formData, trunkSize: e.target.value })}
                  placeholder="—"
                  aria-invalid={Boolean(fieldError('trunkSize'))}
                  aria-describedby="tf-trunkSize-msg"
                  className={`w-full min-h-11 text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono tabular-nums placeholder:text-slate-400${errCls('trunkSize')}`}
                />
                {fieldError('trunkSize') && <p id="tf-trunkSize-msg" className="text-xs text-rose-700 mt-0.5">{fieldError('trunkSize')}</p>}
              </div>

              <div>
                <label className="block text-xs text-slate-700 mb-1 font-medium">
                  {t('field.canopy')}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.canopySize}
                  onChange={(e) => setFormData({ ...formData, canopySize: e.target.value })}
                  placeholder="—"
                  aria-invalid={Boolean(fieldError('canopySize'))}
                  aria-describedby="tf-canopySize-msg"
                  className={`w-full min-h-11 text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono tabular-nums placeholder:text-slate-400${errCls('canopySize')}`}
                />
                {fieldError('canopySize') && <p id="tf-canopySize-msg" className="text-xs text-rose-700 mt-0.5">{fieldError('canopySize')}</p>}
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
                  aria-invalid={Boolean(fieldError('floweringClusters'))}
                  aria-describedby="tf-floweringClusters-msg"
                  className={`w-full min-h-11 text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono tabular-nums placeholder:text-slate-400${errCls('floweringClusters')}`}
                />
                {fieldError('floweringClusters') && <p id="tf-floweringClusters-msg" className="text-xs text-rose-700 mt-0.5">{fieldError('floweringClusters')}</p>}
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
                  aria-invalid={Boolean(fieldError('estimatedFruitCount'))}
                  aria-describedby="tf-estimatedFruitCount-msg"
                  className={`w-full min-h-11 text-sm px-3 py-2 bg-emerald-50/50 border border-emerald-300 rounded-lg font-mono tabular-nums font-bold text-emerald-800 focus:bg-white placeholder:text-slate-400${errCls('estimatedFruitCount')}`}
                />
                {fieldError('estimatedFruitCount') && <p id="tf-estimatedFruitCount-msg" className="text-xs text-rose-700 mt-0.5">{fieldError('estimatedFruitCount')}</p>}
              </div>
            </div>
          </div>

          {formCheck.fruitWarning && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5 -mt-2">
              {t(formCheck.fruitWarning.key, formCheck.fruitWarning.vars)}
            </p>
          )}

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

    {remoteUpdate && (
      <div role="status" className="px-4 py-2.5 bg-sky-50 border border-sky-200 text-sky-900 text-xs rounded-xl flex flex-wrap items-center justify-between gap-2">
        <span>
          {t('tree.remote.updated')}
          {remoteUpdate.conflicts.length > 0 && ` ${t('tree.remote.conflicts', { fields: remoteUpdate.conflicts.map((k) => t(FIELD_LABEL[k] || k)).join(', ') })}`}
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setFormData({ ...initialData });
              setRemoteUpdate(null);
            }}
            className="px-2.5 py-1 rounded-md border border-sky-300 bg-white font-semibold"
          >
            {t('tree.remote.discard')}
          </button>
          <button type="button" onClick={() => setRemoteUpdate(null)} className="px-2.5 py-1 rounded-md font-semibold">
            {t('common.close')}
          </button>
        </span>
      </div>
    )}

    {saveError && (
      <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl">
        {saveError}
      </div>
    )}
    </section>
  );
};
