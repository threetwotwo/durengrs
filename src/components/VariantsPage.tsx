import React, { useState, useMemo } from 'react';
import { useFarm } from '../context/FarmContext';
import { DurianVariant } from '../types';
import { PageHeader, btnPrimary, inputCls } from './PageHeader';
import { Link } from './Link';
import { treesUrl } from '../lib/router';
import {
  Sprout,
  Plus,
  Edit2,
  Search,
  Check,
  X,
  RefreshCw,
  Info,
  Calendar,
  MapPin,
  FileText,
} from 'lucide-react';

export const VariantsPage: React.FC = () => {
  const { variants, trees, saveVariant } = useFarm();

  const [search, setSearch] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<DurianVariant | null>(null);

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('');
  const [description, setDescription] = useState('');
  const [characteristics, setCharacteristics] = useState('');
  const [ripeningDays, setRipeningDays] = useState<string | number>('');

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

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedVariant(null);
    setCode('');
    setName('');
    setOrigin('');
    setDescription('');
    setCharacteristics('');
    setRipeningDays('');
    setFormError(null);
  };

  const openEditModal = (variant: DurianVariant) => {
    setModalMode('edit');
    setSelectedVariant(variant);
    setCode(variant.code);
    setName(variant.name);
    setOrigin(variant.origin || '');
    setDescription(variant.description || '');
    setCharacteristics(variant.characteristics || '');
    setRipeningDays(variant.ripeningDays || '');
    setFormError(null);
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedVariant(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setFormError('Variant Code and Variant Name are required.');
      return;
    }

    const cleanCode = code.trim().toUpperCase();
    setIsSaving(true);
    setFormError(null);

    try {
      const variantData: DurianVariant = {
        code: cleanCode,
        name: name.trim(),
        origin: origin.trim(),
        description: description.trim(),
        characteristics: characteristics.trim(),
        ripeningDays: ripeningDays ? Number(ripeningDays) : undefined,
      };

      await saveVariant(variantData);

      setSuccessToast(
        modalMode === 'create'
          ? `Variant "${cleanCode}" added.`
          : `Variant "${cleanCode}" updated.`
      );
      setTimeout(() => setSuccessToast(null), 3000);
      closeModal();
    } catch (err: any) {
      setFormError(`Failed to save variant: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Variants"
        description="Durian varieties on the farm, how many trees each has and how healthy they are."
        actions={
          <button onClick={openCreateModal} className={btnPrimary}>
            <Plus className="w-4 h-4" />
            Add variant
          </button>
        }
      />

      {successToast && (
        <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs rounded-lg flex items-center gap-2 font-medium">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, name or origin…"
            aria-label="Search variants"
            className={`${inputCls} pl-9`}
          />
        </div>
        <span className="text-sm text-slate-600 whitespace-nowrap tabular">{filteredVariants.length} variants</span>
      </div>

      {/* Variant Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVariants.map((variant) => {
          const treeCount = treeCountMap.get(variant.code) || 0;
          const health = healthByVariant.get(variant.code) || { healthy: 0, minor: 0, emergency: 0, not_assessed: 0 };

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
                    title="Edit variant"
                    aria-label={`Edit ${variant.name}`}
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
                      Traits
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
                    aria-label={`Healthy ${health.healthy}, minor ${health.minor}, emergency ${health.emergency}, not assessed ${health.not_assessed}`}
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
                    {treeCount} {treeCount === 1 ? 'tree' : 'trees'}
                  </Link>
                  <span className="text-xs text-slate-600 tabular">
                    {health.emergency > 0 && <span className="text-rose-700 font-semibold">{health.emergency} emergency · </span>}
                    {health.minor > 0 && <span className="text-amber-700 font-semibold">{health.minor} minor · </span>}
                    {health.healthy} healthy
                  </span>
                </div>
                <div className="text-xs">
                  {variant.ripeningDays ? (
                    <span className="flex items-center gap-1 text-slate-600 tabular">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      About {variant.ripeningDays} days from flowering to ripe
                    </span>
                  ) : (
                    <button onClick={() => openEditModal(variant)} className="text-slate-500 hover:text-emerald-700 underline decoration-dotted min-h-8">
                      Add ripening time
                    </button>
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
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Sprout className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold">
                  {modalMode === 'create' ? 'Add New Durian Variant' : `Edit Variant (${code})`}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-md">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Variant Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. MK, BT, BW"
                    disabled={modalMode === 'edit'}
                    required
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 font-mono font-bold uppercase disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <p className="text-xs text-slate-400 mt-0.5">
                    Document ID in <code className="text-slate-600">variants/&#123;code&#125;</code>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Variant Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Musang King"
                    required
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Origin / Region
                  </label>
                  <input
                    type="text"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="e.g. Kelantan, Malaysia"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ripening Schedule (Days from Bloom)
                  </label>
                  <input
                    type="number"
                    value={ripeningDays}
                    onChange={(e) => setRipeningDays(e.target.value)}
                    placeholder="e.g. 105"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Taste Profile & Flesh Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Deep golden flesh, rich custard, sweet-bitter balance..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Botanical Characteristics
                </label>
                <textarea
                  rows={2}
                  value={characteristics}
                  onChange={(e) => setCharacteristics(e.target.value)}
                  placeholder="Tree architecture, flower cluster habits, disease tolerance, leaf features..."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{modalMode === 'create' ? 'Create Variant' : 'Save Changes'}</span>
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
