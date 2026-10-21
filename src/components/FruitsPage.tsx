import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Search } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { fruitUrl, fruitsUrl, goBack, reportUrl, treeUrl, useQueryParams } from '../lib/router';
import { FRUIT_SORTS, type FruitRow, type FruitSort, byVariety, checkFruit, fruitRows, sortFruits, summarizeFruits } from '../lib/fruits';
import { updateHarvestItems } from '../lib/fieldData';
import { diffDays, formatShortDate } from '../lib/treatments';
import { PageHeader, btnPrimary, btnSecondary, inputCls } from './PageHeader';
import { Link } from './Link';

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

  const inScope = useMemo(() => all.filter((r) => (!block || r.block === block) && (!q || r.key.toUpperCase().includes(q) || (r.treeId || '').toUpperCase() === q)), [all, block, q]);
  const rows = useMemo(() => sortFruits(inScope.filter((r) => !variant || r.variant === variant), sort, desc), [inScope, variant, sort, desc]);
  const sum = summarizeFruits(rows);
  const varieties = useMemo(() => byVariety(inScope), [inScope]);
  const codes = useMemo(() => {
    const seen = new Set(all.map((r) => r.variant).filter(Boolean) as string[]);
    variants.forEach((v) => seen.add(v.code));
    return [...seen].sort((a, b) => name(a).localeCompare(name(b)));
  }, [all, variants, name]);
  const filtered = !!(q || variant || block);

  const sortBy = (k: FruitSort) => setParams({ sort: sort === k && desc ? null : k, dir: sort === k && !desc ? 'desc' : null });
  const head = (k: FruitSort, label: string, right = false) => (
    <th scope="col" aria-sort={sort === k ? (desc ? 'descending' : 'ascending') : undefined} className={`${th} ${right ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => sortBy(k)} className={`inline-flex items-center gap-1 ${right ? 'flex-row-reverse' : ''} ${sort === k ? 'text-white' : ''}`}>
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
      <PageHeader title={t('fr.title')} description={t('fr.desc')} />

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
                <th scope="col" className="px-3 py-1.5 text-left font-semibold">{t('fr.variant')}</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">{t('hv2.fruit')}</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">kg</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">{t('fr.col.weight')}</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">{t('fr.col.aroma')}</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">{t('fr.col.skin')}</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">{t('fr.col.shape')}</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {varieties.map(({ variant: v, summary: s }) => (
                <tr key={v} className={`border-t border-slate-100 ${variant === v ? 'bg-emerald-50' : ''}`}>
                  <th scope="row" className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                    <button type="button" onClick={() => setParams({ variant: variant === v || !v ? null : v })} className="text-emerald-800 hover:underline">
                      {v ? name(v) : t('fr.noVariety')}
                    </button>
                  </th>
                  <td className="px-3 py-2 text-right">{fmt(s.n)}</td>
                  <td className="px-3 py-2 text-right">{fmt(s.kg, 1)}</td>
                  <td className="px-3 py-2 text-right">{fmt(s.avgG)}</td>
                  <td className="px-3 py-2 text-right">{fmt(s.aroma, 1)}</td>
                  <td className="px-3 py-2 text-right">{fmt(s.skin, 1)}</td>
                  <td className="px-3 py-2 text-right">{fmt(s.shape, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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
                {head('code', t('fr.col.code'))}
                {head('tree', t('fr.col.tree'))}
                {head('variant', t('fr.col.variant'))}
                {head('date', t('fr.col.date'))}
                {head('weight', t('fr.col.weight'), true)}
                {head('aroma', t('fr.col.aroma'), true)}
                {head('skin', t('fr.col.skin'), true)}
                {head('shape', t('fr.col.shape'), true)}
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-slate-50">
                  <td className={td}>
                    <Link to={fruitUrl(r.key)} className="font-mono text-xs font-semibold text-emerald-800 hover:underline">
                      {r.code || `${r.treeId || '—'} #${r.index + 1}`}
                    </Link>
                  </td>
                  <td className={td}>
                    {r.treeId ? (
                      <Link to={treeUrl(r.treeId)} className="font-mono font-bold text-slate-900 hover:underline">
                        {r.treeId}
                      </Link>
                    ) : (
                      r.block
                    )}
                  </td>
                  <td className={`${td} text-slate-700`} title={name(r.variant)}>
                    {r.variant || '—'}
                  </td>
                  <td className={`${td} text-slate-700`}>{formatShortDate(r.date)}</td>
                  <td className={`${td} text-right font-semibold`}>{fmt(r.weightG)}</td>
                  <td className={`${td} text-right`}>{r.aroma}</td>
                  <td className={`${td} text-right`}>{r.skin}</td>
                  <td className={`${td} text-right`}>{r.shape}</td>
                </tr>
              ))}
            </tbody>
            {sum && (
              <tfoot className="tabular font-semibold text-slate-800 bg-slate-50">
                <tr>
                  <th scope="row" colSpan={4} className="px-2.5 py-2 text-left text-xs font-semibold">
                    {t('fr.sum', { n: fmt(sum.n), kg: fmt(sum.kg, 2), avg: fmt(sum.avgG) })}
                  </th>
                  <td className="px-2.5 py-2 text-right text-xs text-slate-500">{t('fr.avg')}</td>
                  <td className="px-2.5 py-2 text-right">{fmt(sum.aroma, 1)}</td>
                  <td className="px-2.5 py-2 text-right">{fmt(sum.skin, 1)}</td>
                  <td className="px-2.5 py-2 text-right">{fmt(sum.shape, 1)}</td>
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
      items[f.index] = check.value;
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
                {field('weightG', t('fr.col.weight'))}
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
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-3 rounded-lg bg-slate-50">
                <dt className="text-xs text-slate-500">{t('fr.col.weight')}</dt>
                <dd className="text-lg font-bold tabular text-slate-900">{f.weightG.toLocaleString(locale)}</dd>
              </div>
              {SCORES.map(([k, label]) => (
                <div key={k} className="p-3 rounded-lg bg-slate-50" title={t(`fr.scale.${k}`)}>
                  <dt className="text-xs text-slate-500">{t(label)}</dt>
                  <dd className="text-lg font-bold tabular text-slate-900">
                    {f[k]}
                    <span className="text-xs font-normal text-slate-500"> / 5</span>
                  </dd>
                </div>
              ))}
            </dl>
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
                      <span className="tabular text-slate-600">{r.weightG.toLocaleString(locale)} g</span>
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
