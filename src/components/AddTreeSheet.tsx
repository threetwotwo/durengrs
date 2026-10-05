import React, { useMemo, useState } from 'react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { Sheet, fieldInput, fieldLabel } from './Sheet';
import { btnPrimary, btnSecondary } from './PageHeader';
import { createTree } from '../lib/fieldData';
import { checkNewTree, nextTreeNumber, normalizeBlock } from '../lib/trees';
import { navigate, treeUrl } from '../lib/router';
import { todayStr } from '../lib/treatments';

/** Adds one tree: block, number, variety, optional planting date. The ID (e.g. A25) is what workers send on WhatsApp. */
export const AddTreeSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useT();
  const { allTrees, variants, loading } = useFarm();
  const [block, setBlock] = useState('');
  const [number, setNumber] = useState('');
  const [variant, setVariant] = useState('');
  const [planted, setPlanted] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useMemo(
    () => checkNewTree({ block, number, variant, datePlanted: planted }, allTrees, variants.map((v) => v.code), todayStr()),
    [block, number, variant, planted, allTrees, variants]
  );
  const blockOk = /^[A-Z]{1,3}$/.test(block);
  const suggested = blockOk ? nextTreeNumber(allTrees, block) : null;
  const known = blockOk && allTrees.some((x) => x.block === block);
  const shown = (k: keyof typeof check.errors) => (touched ? check.errors[k] : undefined);
  const err = (k: keyof typeof check.errors) => {
    const e = shown(k);
    return e ? <p role="alert" className="text-xs text-rose-700 mt-1">{t(e.key, e.vars)}</p> : null;
  };

  // A changed answer must be confirmed again.
  const warnKey = check.warnings.map((w) => w.code).join(',') + check.id;
  React.useEffect(() => setConfirmed(false), [warnKey]);

  const save = async () => {
    setTouched(true);
    if (loading || busy) return;
    if (!check.id || Object.keys(check.errors).length) return;
    if (check.warnings.length && !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const r = await createTree({ id: check.id, block, number: Number(number), variant, datePlanted: planted || undefined });
      if (r === 'exists') {
        setError(t('tree.new.e.exists', { id: check.id }));
        setBusy(false);
        return;
      }
      onClose();
      navigate(treeUrl(check.id));
    } catch (e: any) {
      console.error('Add tree failed:', e);
      setError(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={t('tree.new.title')}
      subtitle={t('tree.new.subtitle')}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`${btnSecondary} flex-1`}>{t('common.cancel')}</button>
          <button type="button" onClick={save} disabled={busy || loading || (check.warnings.length > 0 && !confirmed)} className={`${btnPrimary} flex-1 disabled:opacity-60`}>
            {busy ? t('tree.new.saving') : t('tree.new.save')}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="nt-block" className={fieldLabel}>{t('tree.new.block')}</label>
          <input
            id="nt-block"
            value={block}
            onChange={(e) => {
              const b = normalizeBlock(e.target.value);
              setBlock(b);
              if (!number && /^[A-Z]{1,3}$/.test(b) && allTrees.some((x) => x.block === b)) setNumber(String(nextTreeNumber(allTrees, b)));
            }}
            autoCapitalize="characters"
            autoComplete="off"
            list="nt-blocks"
            className={fieldInput}
          />
          <datalist id="nt-blocks">
            {Array.from(new Set(allTrees.map((x) => x.block))).sort().map((b) => <option key={b} value={b} />)}
          </datalist>
          <p className="text-xs text-slate-600 mt-1">{t('tree.new.blockHelp')}</p>
          {err('block')}
        </div>
        <div>
          <label htmlFor="nt-number" className={fieldLabel}>{t('tree.new.number')}</label>
          <input id="nt-number" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" autoComplete="off" className={fieldInput} />
          {known && suggested !== null && <p className="text-xs text-slate-600 mt-1">{t('tree.new.numberHelp', { block, n: suggested })}</p>}
          {err('number')}
        </div>
      </div>

      <div>
        <label htmlFor="nt-variant" className={fieldLabel}>{t('tree.new.variant')}</label>
        <select id="nt-variant" value={variant} onChange={(e) => setVariant(e.target.value)} className={fieldInput}>
          <option value="">{t('tree.new.variantPick')}</option>
          {variants.map((v) => <option key={v.code} value={v.code}>{v.code} · {v.name}</option>)}
        </select>
        {variants.length === 0 && <p className="text-xs text-amber-700 mt-1">{t('tree.new.e.noVariants')}</p>}
        {err('variant')}
      </div>

      <div>
        <label htmlFor="nt-planted" className={fieldLabel}>{t('tree.new.planted')}</label>
        <input id="nt-planted" type="date" value={planted} max={todayStr()} onChange={(e) => setPlanted(e.target.value)} className={fieldInput} />
        {err('datePlanted')}
      </div>

      {check.warnings.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
          {check.warnings.map((w) => <p key={w.code} className="text-sm text-amber-900">{t(w.msg.key, w.msg.vars)}</p>)}
          <label className="flex items-start gap-2 text-sm font-semibold text-amber-900">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 w-4 h-4" />
            {t('tree.new.w.confirm')}
          </label>
        </div>
      )}

      {check.id && <p className="text-sm font-bold text-slate-900 tabular">{t('tree.new.preview', { id: check.id })}</p>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </Sheet>
  );
};
