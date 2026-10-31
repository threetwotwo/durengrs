import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Download, Loader2, Pencil, Search } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { fruitUrl, fruitsUrl, goBack, reportUrl, treeUrl, useQueryParams } from '../lib/router';
import {
  FRUIT_SORTS,
  type FruitRow,
  type FruitSort,
  byVariety,
  checkFruit,
  cleanDeliverTo,
  fruitRows,
  fruitsSheet,
  sortFruits,
  summarizeFruits,
  withDeliveries,
} from '../lib/fruits';
import { updateHarvestItems } from '../lib/fieldData';
import { toCsv } from '../lib/kebun';
import { pastedColumn } from '../lib/recount';
import { diffDays, formatShortDate } from '../lib/treatments';
import { PageHeader, btnPrimary, btnSecondary, inputCls } from './PageHeader';
import { Link } from './Link';
import { ScoreChip, ScoreLine } from './HarvestBits';

/** Every fruit the farm loaded (this season's harvests), with the tree's variety when the harvest has none. */
function useFruits(): FruitRow[] {
  const { harvests, allTrees } = useFarm();
  return useMemo(() => {
    const variety = new Map(allTrees.map((x) => [x.id, x.variant]));
    return fruitRows(harvests, (id) => variety.get(id));
  }, [harvests, allTrees]);
}

const useVarietyName = () => {
  const { variants } = useFarm();
  return useMemo(() => {
    const names = new Map(variants.map((v) => [v.code, v.name]));
    return (code?: string) => (code ? names.get(code) || code : '');
  }, [variants]);
};

/**
 * Saves "deliver to" for some fruits: one write per harvest, from its fruits as they are now (a pasted column with
 * several fruits of one harvest writes it once, none lost).
 */
function useSaveDeliveries() {
  const { harvests } = useFarm();
  const live = useRef(harvests);
  live.current = harvests;
  return async (changes: Array<{ row: FruitRow; value: string }>) => {
    const byHarvest = new Map<string, Array<{ index: number; value: string }>>();
    for (const c of changes) byHarvest.set(c.row.harvest.id, [...(byHarvest.get(c.row.harvest.id) || []), { index: c.row.index, value: c.value }]);
    await Promise.all(
      [...byHarvest].map(async ([id, list]) => {
        const h = live.current.find((x) => x.id === id);
        if (h) await updateHarvestItems(id, withDeliveries(h.items || [], list));
      })
    );
  };
}

const omitKeys = <T,>(o: Record<string, T>, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/** The names typed so far, offered while typing so one buyer is always spelled the same. */
const DeliverOptions: React.FC<{ rows: FruitRow[] }> = ({ rows }) => {
  const names = useMemo(() => Array.from(new Set(rows.map((r) => r.deliverTo).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)), [rows]);
  return (
    <datalist id="deliver-options">
      {names.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );
};

const th = 'px-2.5 h-10 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap bg-slate-900 text-slate-200';
const td = 'px-2.5 py-2 border-b border-slate-100 whitespace-nowrap';

/**
 * The fruits table (#/harvest/fruits): one row per fruit from Laporan PANEN, filtered by variety, block or a code or
 * tree typed in, sorted by any column (in the URL: ?variant=MK&block=A&q=A3&sort=weight&dir=desc). Above it the
 * varieties side by side; at the bottom the totals of what is shown.
 */
export const FruitsPage: React.FC = () => {
  const { t, locale } = useT();
  const { blocks, variants } = useFarm();
  const [params, setParams] = useQueryParams();
  const all = useFruits();
  const name = useVarietyName();
  const q = (params.get('q') || '').trim().toUpperCase();
  const variant = params.get('variant') || '';
  const block = params.get('block') || '';
  const sort = (FRUIT_SORTS as string[]).includes(params.get('sort') || '') ? (params.get('sort') as FruitSort) : null;
  const desc = params.get('dir') === 'desc';
  const fmt = (n: number, d = 0) => n.toLocaleString(locale, { maximumFractionDigits: d });
  const kg = (g: number) => `${(g / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;

  const inScope = useMemo(
    () =>
      all.filter(
        (r) => (!block || r.block === block) && (!q || r.key.toUpperCase().includes(q) || (r.treeId || '').toUpperCase() === q || (r.deliverTo || '').toUpperCase().includes(q))
      ),
    [all, block, q]
  );
  const rows = useMemo(() => sortFruits(inScope.filter((r) => !variant || r.variant === variant), sort, desc), [inScope, variant, sort, desc]);
  const sum = summarizeFruits(rows);
  const varieties = useMemo(() => byVariety(inScope), [inScope]);
  const codes = useMemo(() => {
    const seen = new Set(all.map((r) => r.variant).filter(Boolean) as string[]);
    variants.forEach((v) => seen.add(v.code));
    return [...seen].sort((a, b) => name(a).localeCompare(name(b)));
  }, [all, variants, name]);
  const filtered = !!(q || variant || block);

  // ---------- deliver to: typed into the table, saved by itself ----------
  const saveDeliveries = useSaveDeliveries();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, true>>({});
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const cancelled = useRef<string | null>(null);
  const commit = (changes: Array<{ row: FruitRow; value: string }>) => {
    const real = changes.filter((c) => cleanDeliverTo(c.value) !== (c.row.deliverTo || ''));
    const keys = changes.map((c) => c.row.key);
    if (!real.length) return setDrafts((d) => omitKeys(d, keys));
    setBusy((b) => ({ ...b, ...Object.fromEntries(real.map((c) => [c.row.key, true as const])) }));
    saveDeliveries(real)
      .then(() => setDrafts((d) => omitKeys(d, keys)))
      .catch((e: any) => {
        console.error('Deliver-to save failed:', e);
        setMsg({ text: e?.code === 'permission-denied' ? t('err.rulesRecords') : t('fr.saveError'), bad: true });
      })
      .finally(() => setBusy((b) => omitKeys(b, real.map((c) => c.row.key))));
  };
  const focusDeliver = (key?: string) => (key ? document.querySelector<HTMLInputElement>(`input[data-deliver="${CSS.escape(key)}"]`) : null);
  /** A column copied from Google Sheets, from this fruit down the table (blank cells skipped). */
  const pasteDeliveries = (from: FruitRow, text: string): boolean => {
    const col = pastedColumn(text);
    if (!col) return false;
    const start = rows.indexOf(from);
    const changes = col.map((value, i) => ({ row: rows[start + i], value })).filter((c) => c.row && c.value.trim() !== '');
    setDrafts((d) => ({ ...d, ...Object.fromEntries(changes.map((c) => [c.row.key, c.value])) }));
    commit(changes);
    if (changes.length) setMsg({ text: t('fr.pasted', { n: changes.length, from: changes[0].row.code || changes[0].row.key, to: changes[changes.length - 1].row.code || changes[changes.length - 1].row.key }) });
    return true;
  };
  const delivered = rows.filter((r) => r.deliverTo).length;

  const exportCsv = () => {
    const head = [t('fr.col.code'), t('fr.col.tree'), t('common.block'), t('fr.col.variant'), t('fr.variant'), t('fr.col.date'), `${t('fr.col.weight')} (kg)`, t('fr.col.aroma'), t('fr.col.skin'), t('fr.col.shape'), t('fr.col.deliver')];
    const blob = new Blob(['\ufeff' + toCsv(fruitsSheet(rows, head, name))], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buah_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const sortBy = (k: FruitSort) => setParams({ sort: sort === k && desc ? null : k, dir: sort === k && !desc ? 'desc' : null });
  // On a phone the tree, variety and date columns are left out: tree and date are in the fruit's code
  // (A3-20261028-01), the variety has its filter and the comparison above.
  const wide = 'hidden sm:table-cell';
  const head = (k: FruitSort, label: string, align: boolean | 'center' = false, extra = '') => (
    <th scope="col" aria-sort={sort === k ? (desc ? 'descending' : 'ascending') : undefined} className={`${th} ${extra} ${align === 'center' ? 'text-center' : align ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => sortBy(k)} className={`inline-flex items-center gap-1 ${align === true ? 'flex-row-reverse' : ''} ${sort === k ? 'text-white' : ''}`}>
        {label}
        {sort === k && (desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => goBack('/harvest')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 min-h-9">
        <ArrowLeft className="w-4 h-4" />
        {t('hp.title')}
      </button>
      <PageHeader
        title={t('fr.title')}
        description={t('fr.desc')}
        actions={
          rows.length > 0 && (
            <button type="button" onClick={exportCsv} className={btnSecondary} title={t('fr.csv.title', { n: rows.length })}>
              <Download className="w-4 h-4" />
              <span>CSV</span>
            </button>
          )
        }
      />

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs grid grid-cols-2 lg:grid-cols-[1fr_12rem_10rem] gap-2">
        <div className="relative col-span-2 lg:col-span-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            value={params.get('q') || ''}
            onChange={(e) => setParams({ q: e.target.value || null })}
            placeholder={t('fr.search')}
            aria-label={t('fr.search')}
            autoCapitalize="characters"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select value={variant} onChange={(e) => setParams({ variant: e.target.value || null })} aria-label={t('fr.variant')} className={inputCls}>
          <option value="">{t('fr.allVariants')}</option>
          {codes.map((c) => (
            <option key={c} value={c}>
              {name(c)}
            </option>
          ))}
        </select>
        <select value={block} onChange={(e) => setParams({ block: e.target.value || null })} aria-label={t('common.block')} className={inputCls}>
          <option value="">{t('common.allBlocks')}</option>
          {blocks.map((b) => (
            <option key={b} value={b}>
              {t('common.blockN', { n: b })}
            </option>
          ))}
        </select>
      </div>

      {varieties.length > 1 && (
        <section aria-label={t('fr.perVariety')} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="text-left px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('fr.perVariety')}</caption>
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-2 sm:px-3 py-1.5 text-left font-semibold whitespace-nowrap">{t('fr.variant')}</th>
                <th scope="col" className="px-2 sm:px-3 py-1.5 text-right font-semibold whitespace-nowrap hidden sm:table-cell">{t('hv2.fruit')}</th>
                <th scope="col" className="px-2 sm:px-3 py-1.5 text-right font-semibold whitespace-nowrap hidden sm:table-cell">kg</th>
                <th scope="col" className="px-2 sm:px-3 py-1.5 text-right font-semibold whitespace-nowrap">{t('fr.col.avgWeight')}</th>
                <th scope="col" className="px-1.5 sm:px-3 py-1.5 text-center font-semibold whitespace-nowrap">{t('fr.col.aroma')}</th>
                <th scope="col" className="px-1.5 sm:px-3 py-1.5 text-center font-semibold whitespace-nowrap">{t('fr.col.skin')}</th>
                <th scope="col" className="px-1.5 sm:px-3 py-1.5 text-center font-semibold whitespace-nowrap">{t('fr.col.shape')}</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {varieties.map(({ variant: v, summary: s }) => (
                <tr key={v} className={`border-t border-slate-100 ${variant === v ? 'bg-emerald-50' : ''}`}>
                  <th scope="row" className="px-2 sm:px-3 py-2 text-left font-semibold whitespace-nowrap">
                    <button type="button" onClick={() => setParams({ variant: variant === v || !v ? null : v })} className="text-emerald-800 hover:underline">
                      {v ? name(v) : t('fr.noVariety')}
                    </button>
                  </th>
                  <td className="px-2 sm:px-3 py-2 text-right hidden sm:table-cell">{fmt(s.n)}</td>
                  <td className="px-3 py-2 text-right hidden sm:table-cell">{fmt(s.kg, 1)}</td>
                  <td className="px-2 sm:px-3 py-2 text-right whitespace-nowrap">{kg(s.avgG)}</td>
                  <td className="px-1.5 sm:px-3 py-2 text-center"><ScoreChip v={s.aroma} /></td>
                  <td className="px-1.5 sm:px-3 py-2 text-center"><ScoreChip v={s.skin} /></td>
                  <td className="px-1.5 sm:px-3 py-2 text-center"><ScoreChip v={s.shape} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {msg && (
        <p role={msg.bad ? 'alert' : 'status'} className={`text-sm ${msg.bad ? 'p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800' : 'text-slate-700'}`}>
          {msg.text}
        </p>
      )}
      <DeliverOptions rows={all} />

      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-600 bg-white rounded-xl border border-slate-200 space-y-3">
          <p>{all.length ? t('fr.noMatch') : t('fr.none')}</p>
          {filtered && (
            <button type="button" onClick={() => setParams({ q: null, variant: null, block: null })} className={btnSecondary}>
              {t('fr.clear')}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                {head('code', t('fr.col.code'), false, 'sticky left-0 z-10')}
                {head('tree', t('fr.col.tree'), false, wide)}
                {head('variant', t('fr.col.variant'), false, wide)}
                {head('date', t('fr.col.date'), false, wide)}
                {head('weight', t('fr.col.weight'), true)}
                {head('aroma', t('fr.col.aroma'), 'center')}
                {head('skin', t('fr.col.skin'), 'center')}
                {head('shape', t('fr.col.shape'), 'center')}
                {head('deliver', t('fr.col.deliver'), false, 'min-w-[10rem]')}
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((r) => (
                <tr key={r.key} className="group hover:bg-slate-50">
                  {/* The code stays in view while the table scrolls sideways (typing "deliver to" on a phone). */}
                  <td className={`${td} sticky left-0 z-[1] bg-white group-hover:bg-slate-50`}>
                    <Link to={fruitUrl(r.key)} className="font-mono text-xs font-semibold text-emerald-800 hover:underline">
                      {r.code || `${r.treeId || '—'} #${r.index + 1}`}
                    </Link>
                  </td>
                  <td className={`${td} ${wide}`}>
                    {r.treeId ? (
                      <Link to={treeUrl(r.treeId)} className="font-mono font-bold text-slate-900 hover:underline">
                        {r.treeId}
                      </Link>
                    ) : (
                      r.block
                    )}
                  </td>
                  <td className={`${td} ${wide} text-slate-700`} title={name(r.variant)}>
                    {r.variant || '—'}
                  </td>
                  <td className={`${td} ${wide} text-slate-700`}>{formatShortDate(r.date)}</td>
                  <td className={`${td} text-right font-semibold`}>{kg(r.weightG)}</td>
                  <td className={`${td} text-center`}><ScoreChip v={r.aroma} /></td>
                  <td className={`${td} text-center`}><ScoreChip v={r.skin} /></td>
                  <td className={`${td} text-center`}><ScoreChip v={r.shape} /></td>
                  <td className="p-0 border-b border-l border-slate-100">
                    <span className="relative block">
                      <input
                        data-deliver={r.key}
                        list="deliver-options"
                        value={drafts[r.key] ?? r.deliverTo ?? ''}
                        maxLength={80}
                        enterKeyHint="next"
                        autoComplete="off"
                        placeholder="—"
                        aria-label={`${r.code || r.key} · ${t('fr.col.deliver')}`}
                        onChange={(e) => setDrafts((d) => ({ ...d, [r.key]: e.target.value }))}
                        onBlur={(e) => {
                          if (cancelled.current === r.key) {
                            cancelled.current = null;
                            return;
                          }
                          commit([{ row: r, value: e.currentTarget.value }]);
                        }}
                        onPaste={(e) => {
                          if (pasteDeliveries(r, e.clipboardData.getData('text'))) e.preventDefault();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const next = focusDeliver(rows[rows.indexOf(r) + (e.shiftKey ? -1 : 1)]?.key);
                            if (next) next.focus();
                            else e.currentTarget.blur();
                          } else if (e.key === 'Escape') {
                            cancelled.current = r.key;
                            setDrafts((d) => omitKeys(d, [r.key]));
                            e.currentTarget.blur();
                          }
                        }}
                        className="w-full min-w-[10rem] h-10 pl-2.5 pr-6 bg-transparent text-sm text-slate-900 placeholder:text-slate-300 outline-none hover:bg-emerald-50/60 focus:bg-white focus:outline-2 focus:-outline-offset-2 focus:outline-emerald-600"
                      />
                      {busy[r.key] && <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" aria-hidden />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {sum && (
              <tfoot className="tabular font-semibold text-slate-800 bg-slate-50">
                <tr>
                  <th scope="row" className="sticky left-0 bg-slate-50 px-2.5 py-2 text-left text-xs font-semibold sm:hidden">
                    {t('fr.sum', { n: fmt(sum.n), kg: fmt(sum.kg, 2) })}
                  </th>
                  <th scope="row" colSpan={4} className="px-2.5 py-2 text-left text-xs font-semibold hidden sm:table-cell">
                    {t('fr.sum', { n: fmt(sum.n), kg: fmt(sum.kg, 2) })}
                  </th>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">{kg(sum.avgG)}</td>
                  <td className="px-2.5 py-2 text-center"><ScoreChip v={sum.aroma} avg /></td>
                  <td className="px-2.5 py-2 text-center"><ScoreChip v={sum.skin} avg /></td>
                  <td className="px-2.5 py-2 text-center"><ScoreChip v={sum.shape} avg /></td>
                  <td className="px-2.5 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{delivered > 0 ? t('fr.deliveredN', { n: fmt(delivered) }) : ''}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

const SCORES = [
  ['aroma', 'fr.col.aroma'],
  ['skin', 'fr.col.skin'],
  ['shape', 'fr.col.shape'],
] as const;

/** One fruit (#/harvest/fruits/<code>): where and when it was picked, its weight and scores (editable), the report. */
export const FruitPage: React.FC<{ fruitKey: string }> = ({ fruitKey }) => {
  const { t, locale } = useT();
  const { workerLabel } = useFarm();
  const all = useFruits();
  const name = useVarietyName();
  const f = all.find((r) => r.key === fruitKey);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ weightG: '', aroma: '', skin: '', shape: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (f && !editing) setForm({ weightG: String(f.weightG), aroma: String(f.aroma), skin: String(f.skin), shape: String(f.shape) });
  }, [f?.weightG, f?.aroma, f?.skin, f?.shape, editing]);

  const back = (
    <button type="button" onClick={() => goBack(fruitsUrl())} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 min-h-9">
      <ArrowLeft className="w-4 h-4" />
      {t('fr.open')}
    </button>
  );
  if (!f)
    return (
      <div className="space-y-4">
        {back}
        <p className="p-8 text-center text-sm text-slate-600 bg-white rounded-xl border border-slate-200">{t('fr.notFound', { code: fruitKey })}</p>
      </div>
    );

  const h = f.harvest;
  const siblings = all.filter((r) => r.harvest.id === h.id);
  const save = async () => {
    const check = checkFruit(form, f.code);
    if (!check.ok) {
      const label = check.field === 'weightG' ? '' : t(SCORES.find(([k]) => k === check.field)![1]);
      return setError(check.field === 'weightG' ? t('fr.e.weightG') : t('fr.e.score', { label }));
    }
    setError(null);
    setSaving(true);
    try {
      const items = [...(h.items || [])];
      // Corrected weight and scores; the rest of the fruit (where it went) stays.
      items[f.index] = { ...items[f.index], ...check.value };
      await updateHarvestItems(h.id, items);
      setEditing(false);
    } catch (e: any) {
      console.error('Fruit save failed:', e);
      setError(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('fr.saveError'));
    } finally {
      setSaving(false);
    }
  };
  const facts: Array<[string, React.ReactNode]> = [
    [t('fr.tree'), f.treeId ? <Link to={treeUrl(f.treeId)} className="font-mono font-bold text-emerald-800 hover:underline">{f.treeId}</Link> : '—'],
    [t('fr.variant'), [name(f.variant), f.block ? t('common.blockN', { n: f.block }) : null].filter(Boolean).join(' · ') || '—'],
    [t('fr.picked'), formatShortDate(f.date)],
  ];
  if (h.floweredOn) facts.push([t('fr.fromBloom'), `${h.daysFromBloom ?? diffDays(h.date, h.floweredOn)} (${formatShortDate(h.floweredOn)})`]);
  if (h.workerPhone) facts.push([t('fr.by'), workerLabel(h.workerPhone)]);
  facts.push([t('fr.col.deliver'), <DeliverField key={f.key} row={f} />]);
  const field = (k: 'weightG' | 'aroma' | 'skin' | 'shape', label: string, hint?: string) => (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <input
        inputMode="numeric"
        value={form[k]}
        onChange={(e) => setForm((x) => ({ ...x, [k]: e.target.value }))}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        className={inputCls}
      />
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      {back}
      <DeliverOptions rows={all} />
      <article className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <header className="p-4 sm:p-5 space-y-0.5 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-900 font-mono break-all">{f.code || `${f.treeId || ''} #${f.index + 1}`}</h1>
          <p className="text-sm text-slate-600">{t('fr.of', { i: f.index + 1, n: siblings.length })}</p>
        </header>
        <dl className="px-4 sm:px-5 divide-y divide-slate-100">
          {facts.map(([label, v]) => (
            <div key={label} className="py-2 grid grid-cols-[minmax(0,10rem)_1fr] gap-3 text-sm">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-slate-900 min-w-0">{v}</dd>
            </div>
          ))}
        </dl>

        <section className="p-4 sm:p-5 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">{t('fr.scores')}</h2>
            {!editing && (
              <button type="button" onClick={() => setEditing(true)} className="min-h-9 px-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5">
                <Pencil className="w-4 h-4" />
                {t('fr.edit')}
              </button>
            )}
          </div>
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {field('weightG', `${t('fr.col.weight')} (gram)`)}
                {SCORES.map(([k, label]) => (
                  <React.Fragment key={k}>{field(k, `${t(label)} (1-5)`, t(`fr.scale.${k}`))}</React.Fragment>
                ))}
              </div>
              {error && (
                <p role="alert" className="text-sm text-rose-700">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={save} disabled={saving} className={btnPrimary}>
                  {saving ? t('fr.saving') : t('fr.save')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                  }}
                  className={btnSecondary}
                >
                  {t('fr.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="leading-none">
                <span className="text-xs text-slate-500 block mb-1">{t('fr.col.weight')}</span>
                <span className="text-2xl font-bold tabular text-slate-900">{(f.weightG / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
              </p>
              <ScoreLine scores={{ aroma: f.aroma, skin: f.skin, shape: f.shape }} size="lg" />
            </div>
          )}
        </section>

        {siblings.length > 1 && (
          <section className="p-4 sm:p-5 border-t border-slate-100 space-y-2">
            <h2 className="text-sm font-bold text-slate-900">{t('fr.siblings')}</h2>
            <ul className="flex flex-wrap gap-1.5">
              {siblings
                .filter((r) => r.key !== f.key)
                .map((r) => (
                  <li key={r.key}>
                    <Link to={fruitUrl(r.key)} replace className="min-h-9 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-emerald-800">{r.code || `#${r.index + 1}`}</span>
                      <span className="tabular text-slate-600">{(r.weightG / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        )}

        <footer className="px-4 sm:px-5 py-3 border-t border-slate-100 text-sm">
          <Link to={reportUrl(`harvest:${h.id}`)} className="font-semibold text-emerald-700 hover:underline min-h-9 inline-flex items-center">
            {t('fr.harvest.open', { n: siblings.length })}
          </Link>
        </footer>
      </article>
    </div>
  );
};

/** "Deliver to" on a fruit's page: typed in place, saved when leaving the box or with Enter. */
const DeliverField: React.FC<{ row: FruitRow }> = ({ row }) => {
  const { t } = useT();
  const save = useSaveDeliveries();
  const [text, setText] = useState(row.deliverTo || '');
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  useEffect(() => setText(row.deliverTo || ''), [row.deliverTo]);
  const commit = () => {
    if (cleanDeliverTo(text) === (row.deliverTo || '')) return;
    setState('saving');
    save([{ row, value: text }])
      .then(() => setState('idle'))
      .catch((e) => {
        console.error('Deliver-to save failed:', e);
        setState('error');
      });
  };
  return (
    <span className="block">
      <span className="relative block max-w-xs">
        <input
          list="deliver-options"
          value={text}
          maxLength={80}
          placeholder={t('fr.deliver.placeholder')}
          aria-label={t('fr.col.deliver')}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className={`${inputCls} !min-h-9 pr-8`}
        />
        {state === 'saving' && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" aria-hidden />}
      </span>
      {state === 'error' && <span role="alert" className="block mt-1 text-xs text-rose-700">{t('fr.saveError')}</span>}
    </span>
  );
};
