import React, { useEffect, useMemo, useState } from 'react';
import { useFarm } from '../context/FarmContext';
import { DurianVariant } from '../types';
import { PageHeader, btnPrimary, inputCls } from './PageHeader';
import { Link } from './Link';
import { treesUrl, useQueryParams } from '../lib/router';
import { useT } from '../i18n';
import { pick, ripeningRefFor } from '../lib/guide';
import { addDays, diffDays, formatShortDate, todayStr } from '../lib/treatments';
import {
  RIPENING_MAX,
  RIPENING_MIN,
  normalizeCode,
  ripeningOutsideRef,
  unknownVariantCodes,
  validateVariant,
} from '../lib/variants';
import {
  Sprout,
  Plus,
  Edit2,
  Search,
  Check,
  X,
  RefreshCw,
  Calendar,
  MapPin,
  AlertTriangle,
  Moon,
  Wheat,
  BookOpen,
} from 'lucide-react';

const fieldCls =
  'w-full text-sm p-2.5 border rounded-md focus:ring-2 focus:ring-emerald-500 aria-[invalid=true]:border-rose-500 aria-[invalid=true]:bg-rose-50/40';

export const VariantsPage: React.FC = () => {
  const { variants, trees, harvestCycles, saveVariant } = useFarm();
  const { t, lang } = useT();
  const [params, setParams] = useQueryParams();

  const [search, setSearch] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('');
  const [description, setDescription] = useState('');
  const [characteristics, setCharacteristics] = useState('');
  const [ripeningDays, setRipeningDays] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Tree count per variant
  const treeCountMap = useMemo(() => {
    const map = new Map<string, number>();
    trees.forEach((t) => {
      const v = t.variant;
      map.set(v, (map.get(v) || 0) + 1);
    });
    return map;
  }, [trees]);

  const healthByVariant = useMemo(() => {
    const map = new Map<string, { healthy: number; minor: number; emergency: number; not_assessed: number }>();
    trees.forEach((tr) => {
      const m = map.get(tr.variant) || { healthy: 0, minor: 0, emergency: 0, not_assessed: 0 };
      const c = tr.condition === 'healthy' || tr.condition === 'minor' || tr.condition === 'emergency' ? tr.condition : 'not_assessed';
      m[c]++;
      map.set(tr.variant, m);
    });
    return map;
  }, [trees]);

  // Which varieties grow in which block: for harvest dates and single-variety (pollination) warnings.
  const variantsByBlock = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const tr of trees) {
      if (!tr.block || !tr.variant) continue;
      const s = map.get(tr.block) || new Set<string>();
      s.add(tr.variant);
      map.set(tr.block, s);
    }
    return map;
  }, [trees]);

  const unknown = useMemo(() => unknownVariantCodes(trees, variants), [trees, variants]);

  const filteredVariants = useMemo(() => {
    if (!search.trim()) return variants;
    const q = search.toLowerCase();
    return variants.filter(
      (v) =>
        v.code.toLowerCase().includes(q) ||
        v.name.toLowerCase().includes(q) ||
        (v.description && v.description.toLowerCase().includes(q)) ||
        (v.origin && v.origin.toLowerCase().includes(q))
    );
  }, [variants, search]);

  const openCreateModal = (prefillCode = '') => {
    setModalMode('create');
    setCode(prefillCode);
    setName('');
    setOrigin('');
    setDescription('');
    setCharacteristics('');
    setRipeningDays('');
    setFormError(null);
    setSubmitted(false);
  };

  const openEditModal = (variant: DurianVariant) => {
    setModalMode('edit');
    setCode(variant.code);
    // A nameless document shows its description as the name; never save that back as the name.
    setName(variant.nameMissing ? '' : variant.name);
    setOrigin(variant.origin || '');
    setDescription(variant.description || '');
    setCharacteristics(variant.characteristics || '');
    setRipeningDays(variant.ripeningDays !== undefined && variant.ripeningDays !== null ? String(variant.ripeningDays) : '');
    setFormError(null);
    setSubmitted(false);
  };

  // Deep links from the Guide: ?edit=MK opens that variant, ?new=XY starts a new one with that code.
  const editParam = params.get('edit');
  const newParam = params.get('new');
  useEffect(() => {
    if (editParam) {
      const v = variants.find((x) => x.code === editParam);
      if (v) openEditModal(v);
    } else if (newParam) {
      openCreateModal(newParam);
    }
    // variants: wait until they are loaded before opening an edit link
  }, [editParam, newParam, variants.length > 0]);

  const closeModal = () => {
    setModalMode(null);
    setFormError(null);
    if (editParam || newParam) setParams({ edit: null, new: null });
  };

  useEffect(() => {
    if (!modalMode) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !isSaving && closeModal();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalMode, isSaving, editParam, newParam]);

  const validation = useMemo(
    () => validateVariant({ code, name, ripeningDays }, variants, modalMode === 'edit' ? 'edit' : 'create'),
    [code, name, ripeningDays, variants, modalMode]
  );
  const showError = (field: 'code' | 'name' | 'ripeningDays') => {
    const key = validation.errors[field];
    // Show as soon as something was typed, or after a save attempt.
    const touched = field === 'code' ? code : field === 'name' ? name : ripeningDays;
    return key && (submitted || touched.trim() !== '') ? t(key, { min: RIPENING_MIN, max: RIPENING_MAX }) : null;
  };
  const formRef = ripeningRefFor({ code: normalizeCode(code), name } as DurianVariant);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(validation.errors).length > 0) {
      setFormError(t('var.v.fix'));
      return;
    }

    // Edit keeps the stored code exactly (it is the document ID trees point to).
    const cleanCode = modalMode === 'edit' ? code : normalizeCode(code);
    setIsSaving(true);
    setFormError(null);

    try {
      const variantData: DurianVariant = {
        code: cleanCode,
        name: name.trim(),
        origin: origin.trim(),
        description: description.trim(),
        characteristics: characteristics.trim(),
        ripeningDays: ripeningDays.trim() ? Number(ripeningDays) : undefined,
      };

      await saveVariant(variantData);

      setSuccessToast(
        modalMode === 'create'
          ? t('var.toast.added', { code: cleanCode })
          : t('var.toast.updated', { code: cleanCode })
      );
      setTimeout(() => setSuccessToast(null), 3000);
      closeModal();
    } catch (err: any) {
      setFormError(t('var.error.save', { msg: err.message }));
    } finally {
      setIsSaving(false);
    }
  };

  const today = todayStr();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('var.title')}
        description={t('var.desc')}
        actions={
          <button onClick={() => openCreateModal()} className={btnPrimary}>
            <Plus className="w-4 h-4" />
            {t('var.add')}
          </button>
        }
      />

      {successToast && (
        <div role="status" className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs rounded-lg flex items-center gap-2 font-medium">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Codes on trees with no variant record: those trees get no ripening days, harvest date or Guide stage. */}
      {unknown.length > 0 && (
        <section role="alert" className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
          <h2 className="text-sm font-bold text-amber-950 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            {t('var.unknown.title')}
          </h2>
          <p className="text-sm text-amber-900">{t('var.unknown.body')}</p>
          <ul className="flex flex-wrap gap-2">
            {unknown.map((u) => (
              <li key={u.code} className="flex items-center gap-2 bg-white rounded-lg border border-amber-200 pl-3 pr-1 py-1">
                <span className="font-mono font-bold text-sm text-slate-900">{u.code}</span>
                <Link to={treesUrl({ variant: u.code })} className="text-xs text-slate-600 hover:underline">
                  {t(u.trees === 1 ? 'var.trees.one' : 'var.trees.other', { n: u.trees })}
                </Link>
                <button
                  type="button"
                  onClick={() => openCreateModal(u.code)}
                  className="min-h-9 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  {t('var.unknown.add', { code: u.code })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('var.search.placeholder')}
            aria-label={t('var.search.aria')}
            className={`${inputCls} pl-9`}
          />
        </div>
        <span className="text-sm text-slate-600 whitespace-nowrap tabular">{t('var.count', { n: filteredVariants.length })}</span>
      </div>

      {/* Variant Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVariants.map((variant) => {
          const treeCount = treeCountMap.get(variant.code) || 0;
          const health = healthByVariant.get(variant.code) || { healthy: 0, minor: 0, emergency: 0, not_assessed: 0 };
          const ref = ripeningRefFor(variant);
          const outside = ripeningOutsideRef(variant);
          const days = Number(variant.ripeningDays) > 0 ? Number(variant.ripeningDays) : null;

          // Expected harvest per block that grows this variety and has a bloom date (recent or upcoming only).
          const harvests = days
            ? harvestCycles
                .filter((c) => variantsByBlock.get(c.block)?.has(variant.code))
                .map((c) => ({ block: c.block, date: addDays(c.floweredOn, days) }))
                .filter((h) => diffDays(h.date, today) >= -14)
                .sort((a, b) => a.date.localeCompare(b.date))
            : [];
          // Blocks where this is the only variety: no pollinator variety nearby.
          const soloBlocks = Array.from(variantsByBlock.entries())
            .filter(([, set]) => set.size === 1 && set.has(variant.code))
            .map(([b]) => b)
            .sort();

          return (
            <div
              key={variant.code}
              className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between hover:border-emerald-300 transition-all group"
            >
              <div className="space-y-3">
                {/* Header: Code & Name */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-900 font-mono font-bold text-sm flex items-center justify-center border border-emerald-300 shrink-0">
                      {variant.code}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-tight">
                        {variant.name}
                        {variant.nameMissing && <span className="ml-1.5 text-xs font-semibold text-amber-700">· {t('var.noName')}</span>}
                      </h3>
                      {variant.origin && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{variant.origin}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => openEditModal(variant)}
                    className="min-h-11 min-w-11 -m-2 flex items-center justify-center rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title={t('var.edit.title')}
                    aria-label={t('var.edit.aria', { name: variant.name })}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Description */}
                {variant.description && (
                  <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {variant.description}
                  </p>
                )}

                {/* Characteristics */}
                {variant.characteristics && (
                  <div className="text-xs text-slate-600 space-y-0.5">
                    <span className="font-semibold text-slate-700 block text-xs uppercase tracking-wider">
                      {t('var.traits')}
                    </span>
                    <p className="line-clamp-2">{variant.characteristics}</p>
                  </div>
                )}
              </div>

              {/* Health mix + link to the trees of this variant */}
              <div className="pt-4 mt-3 border-t border-slate-100 space-y-2.5">
                {treeCount > 0 && (
                  <div
                    className="flex h-2 rounded-full overflow-hidden bg-slate-100"
                    role="img"
                    aria-label={t('var.health.aria', { ...health })}
                  >
                    {[
                      { n: health.healthy, c: 'bg-emerald-500' },
                      { n: health.minor, c: 'bg-amber-400' },
                      { n: health.emergency, c: 'bg-rose-500' },
                      { n: health.not_assessed, c: 'bg-slate-300' },
                    ].map((s, i) => (s.n > 0 ? <div key={i} className={s.c} style={{ width: `${(s.n / treeCount) * 100}%` }} /> : null))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-sm">
                  <Link to={treesUrl({ variant: variant.code })} className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline">
                    {t(treeCount === 1 ? 'var.trees.one' : 'var.trees.other', { n: treeCount })}
                  </Link>
                  <span className="text-xs text-slate-600 tabular">
                    {health.emergency > 0 && <span className="text-rose-700 font-semibold">{t('var.n.emergency', { n: health.emergency })} · </span>}
                    {health.minor > 0 && <span className="text-amber-700 font-semibold">{t('var.n.minor', { n: health.minor })} · </span>}
                    {t('var.n.healthy', { n: health.healthy })}
                  </span>
                </div>
                <div className="text-xs space-y-1">
                  {days ? (
                    <span className="flex items-center gap-1 text-slate-600 tabular">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {t('var.ripening', { n: days })}
                    </span>
                  ) : (
                    <button onClick={() => openEditModal(variant)} className="text-slate-500 hover:text-emerald-700 underline decoration-dotted min-h-8">
                      {t('var.addRipening')}
                      {ref ? ` · ${t('var.ref', { min: ref.min, max: ref.max })}` : ''}
                    </button>
                  )}
                  {outside && (
                    <Link to="/guide/harvest" className="flex items-start gap-1 text-amber-800 hover:underline">
                      <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                      {t('var.g.outside', { min: outside.min, max: outside.max })}
                    </Link>
                  )}
                  {harvests.length > 0 && (
                    <Link to="/schedule?view=harvest" className="flex items-start gap-1 text-slate-700 hover:underline tabular">
                      <Wheat className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" />
                      <span>
                        {t('var.g.harvest')}:{' '}
                        {harvests
                          .slice(0, 3)
                          .map((h) => t('var.g.harvestRow', { block: h.block, date: formatShortDate(h.date) }))
                          .join(', ')}
                      </span>
                    </Link>
                  )}
                  {soloBlocks.length > 0 && (
                    <Link to="/guide/pollination" className="flex items-start gap-1 text-slate-700 hover:underline">
                      <Moon className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" />
                      {t('var.g.single', { blocks: soloBlocks.map((b) => t('common.blockN', { n: b })).join(', ') })}
                    </Link>
                  )}
                  {ref && (
                    <p className="flex items-start gap-1 text-slate-500">
                      <BookOpen className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" />
                      <span>{pick(ref.note, lang)}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Variant Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="var-modal-h"
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Sprout className="w-5 h-5 text-emerald-400" />
                <h2 id="var-modal-h" className="text-base font-bold">
                  {modalMode === 'create' ? t('var.modal.create') : t('var.modal.edit', { code })}
                </h2>
              </div>
              <button
                onClick={closeModal}
                aria-label={t('common.close')}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
              {formError && (
                <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-md">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="vf-code" className="block text-xs font-medium text-slate-700 mb-1">
                    {t('var.f.code')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="vf-code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder={t('var.f.code.ph')}
                    disabled={modalMode === 'edit'}
                    maxLength={10}
                    autoComplete="off"
                    aria-invalid={Boolean(showError('code'))}
                    aria-describedby="vf-code-msg"
                    className={`${fieldCls} border-slate-300 font-mono font-bold uppercase disabled:bg-slate-100 disabled:text-slate-500`}
                  />
                  <p id="vf-code-msg" className={`text-xs mt-0.5 ${showError('code') ? 'text-rose-700' : 'text-slate-500'}`}>
                    {showError('code') || (modalMode === 'edit' ? t('var.f.code.locked') : t('var.f.code.rules'))}
                  </p>
                </div>

                <div>
                  <label htmlFor="vf-name" className="block text-xs font-medium text-slate-700 mb-1">
                    {t('var.f.name')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="vf-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('var.f.name.ph')}
                    maxLength={60}
                    aria-invalid={Boolean(submitted && validation.errors.name)}
                    aria-describedby="vf-name-msg"
                    className={`${fieldCls} border-slate-300 font-medium`}
                  />
                  <p id="vf-name-msg" className="text-xs mt-0.5">
                    {submitted && validation.errors.name ? (
                      <span className="text-rose-700">{t(validation.errors.name)}</span>
                    ) : validation.warnings.name ? (
                      <span className="text-amber-800">{t(validation.warnings.name.key, validation.warnings.name.vars)}</span>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="vf-origin" className="block text-xs font-medium text-slate-700 mb-1">
                    {t('var.f.origin')}
                  </label>
                  <input
                    id="vf-origin"
                    type="text"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder={t('var.f.origin.ph')}
                    className={`${fieldCls} border-slate-300`}
                  />
                </div>

                <div>
                  <label htmlFor="vf-ripening" className="block text-xs font-medium text-slate-700 mb-1">
                    {t('var.f.ripening')}
                  </label>
                  <input
                    id="vf-ripening"
                    type="number"
                    inputMode="numeric"
                    min={RIPENING_MIN}
                    max={RIPENING_MAX}
                    step={1}
                    value={ripeningDays}
                    onChange={(e) => setRipeningDays(e.target.value)}
                    placeholder={formRef ? String(formRef.min) : t('var.f.ripening.ph')}
                    aria-invalid={Boolean(showError('ripeningDays'))}
                    aria-describedby="vf-ripening-msg"
                    className={`${fieldCls} border-slate-300 font-mono`}
                  />
                  <p id="vf-ripening-msg" className="text-xs mt-0.5 space-y-0.5">
                    {showError('ripeningDays') ? (
                      <span className="block text-rose-700">{showError('ripeningDays')}</span>
                    ) : validation.warnings.ripeningDays ? (
                      <span className="block text-amber-800">{t(validation.warnings.ripeningDays.key, validation.warnings.ripeningDays.vars)}</span>
                    ) : null}
                    <span className="block text-slate-500">
                      {formRef ? t('var.ref', { min: formRef.min, max: formRef.max }) : t('var.ref.none')}{' '}
                      <Link to="/guide/harvest" className="text-emerald-700 font-semibold">{t('var.ref.guide')} →</Link>
                    </span>
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="vf-desc" className="block text-xs font-medium text-slate-700 mb-1">
                  {t('var.f.desc')}
                </label>
                <textarea
                  id="vf-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('var.f.desc.ph')}
                  className={`${fieldCls} border-slate-300`}
                />
              </div>

              <div>
                <label htmlFor="vf-traits" className="block text-xs font-medium text-slate-700 mb-1">
                  {t('var.f.traits')}
                </label>
                <textarea
                  id="vf-traits"
                  rows={2}
                  value={characteristics}
                  onChange={(e) => setCharacteristics(e.target.value)}
                  placeholder={t('var.f.traits.ph')}
                  className={`${fieldCls} border-slate-300`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="min-h-11 px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="min-h-11 px-5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('var.saving')}</span>
                    </>
                  ) : (
                    <span>{modalMode === 'create' ? t('var.create') : t('var.save')}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
