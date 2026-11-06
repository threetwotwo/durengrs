import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, ChevronLeft, ChevronRight, Download, Loader2, Pencil, Search, Trash2 } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { fruitUrl, fruitsUrl, goBack, reportUrl, treeUrl, useQueryParams } from '../lib/router';
import {
  FRUIT_SORTS,
  type FruitRow,
  type FruitSort,
  byVariety,
  checkFruit,
  fruitDays,
  fruitRows,
  fruitsSheet,
  likelyDuplicates,
  shortCode,
  sortFruits,
  summarizeFruits,
} from '../lib/fruits';
import { removeHarvestFruit, updateHarvestItems } from '../lib/fieldData';
import { toCsv } from '../lib/kebun';
import { CRITERIA, GRADE_FROM, GROUPS, type Grade, type QcKey, qcTotal, scoreOf } from '../lib/grading';
import { diffDays, formatShortDate, todayStr } from '../lib/treatments';
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



const GRADE_TONE: Record<Grade, string> = {
  high: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  mid: 'bg-amber-100 text-amber-900 border-amber-200',
  low: 'bg-rose-100 text-rose-900 border-rose-200',
  ungraded: 'bg-slate-100 text-slate-600 border-slate-200',
};
const GRADES_ORDER: Grade[] = ['high', 'mid', 'low', 'ungraded'];

/** A fruit's grade as a small tag, its total beside it once graded ("High 74%"). */
export const GradeTag: React.FC<{ grade: Grade; pct?: number; size?: 'sm' | 'lg' }> = ({ grade, pct, size = 'sm' }) => {
  const { t, locale } = useT();
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border font-semibold whitespace-nowrap tabular ${size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-1.5 py-0.5 text-[11px]'} ${GRADE_TONE[grade]}`}>
      {t(`qc.grade.${grade}`)}
      {pct !== undefined && grade !== 'ungraded' && <span className="font-bold">{pct.toLocaleString(locale, { maximumFractionDigits: 1 })}%</span>}
    </span>
  );
};

/** A day as a heading: "Hari ini", "Kemarin", else "Sen, 2 Nov". */
function useDayLabel() {
  const { t, locale } = useT();
  const today = todayStr();
  return (d: string) => {
    const n = diffDays(today, d);
    if (n === 0) return t('fr.today');
    if (n === 1) return t('fr.yesterday');
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  };
}

/**
 * The harvest days as a month calendar: a day with fruit shows how many; tap days to pick one or several (tap again
 * to leave one out). Folded under a button that says what is picked, so the page stays short on a phone.
 */
const DayCalendar: React.FC<{
  days: Array<{ date: string; n: number; g: number }>;
  picked: Set<string>;
  onToggle: (d: string) => void;
  onClear: () => void;
}> = ({ days, picked, onToggle, onClear }) => {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const today = todayStr();
  const start = [...picked].sort().reverse()[0] || days[0]?.date || today;
  const [month, setMonth] = useState(start.slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // weeks start on Monday
  const count = new Date(y, m, 0).getDate();
  const iso = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
  const shift = (k: number) => {
    const d = new Date(y, m - 1 + k, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 2 + i).toLocaleDateString(locale, { weekday: 'narrow' }));
  const sel = days.filter((d) => picked.has(d.date));
  const summary = picked.size
    ? `${t('fr.daysN', { n: picked.size })} · ${t('fr.dayN', { n: sel.reduce((s, d) => s + d.n, 0) })}`
    : t('fr.allDays');
  return (
    <div className="col-span-2 lg:col-span-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${btnSecondary} !min-h-10`}>
          <CalendarDays className="w-4 h-4" />
          {summary}
        </button>
        {picked.size > 0 && (
          <button type="button" onClick={onClear} className="min-h-10 px-3 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            {t('fr.allDays')}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 w-full max-w-sm rounded-xl border border-slate-200 p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <button type="button" onClick={() => shift(-1)} aria-label={t('fr.cal.prev')} className="w-9 h-9 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-slate-900">{first.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</span>
            <button type="button" onClick={() => shift(1)} aria-label={t('fr.cal.next')} className="w-9 h-9 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map((w, i) => (
              <span key={i} className="text-[11px] font-semibold text-slate-400 pb-0.5">{w}</span>
            ))}
            {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: count }, (_, i) => {
              const d = iso(i + 1);
              const h = byDate.get(d);
              const on = picked.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!h}
                  aria-pressed={h ? on : undefined}
                  onClick={() => onToggle(d)}
                  title={h ? `${t('fr.dayN', { n: h.n })} · ${(h.g / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} kg` : undefined}
                  className={`h-11 rounded-lg flex flex-col items-center justify-center leading-none text-sm tabular ${
                    on
                      ? 'bg-emerald-700 text-white font-bold'
                      : h
                        ? 'bg-emerald-50 text-slate-900 font-semibold hover:bg-emerald-100'
                        : 'text-slate-300'
                  } ${d === today && !on ? 'ring-1 ring-slate-400' : ''}`}
                >
                  {i + 1}
                  {h && <span className={`mt-0.5 text-[10px] ${on ? 'text-emerald-100' : 'text-emerald-700'}`}>{h.n}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
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
  const gradeF = (GRADES_ORDER as string[]).includes(params.get('grade') || '') ? (params.get('grade') as Grade) : '';
  const sort = (FRUIT_SORTS as string[]).includes(params.get('sort') || '') ? (params.get('sort') as FruitSort) : null;
  const desc = params.get('dir') === 'desc';
  const fmt = (n: number, d = 0) => n.toLocaleString(locale, { maximumFractionDigits: d });
  // A fruit's weight (and the averages) in grams, as weighed; totals stay in kilos.
  const kg = (g: number) => Math.round(g).toLocaleString(locale);

  const inScope = useMemo(
    () =>
      all.filter(
        (r) => (!block || r.block === block) && (!q || r.key.toUpperCase().includes(q) || (r.treeId || '').toUpperCase() === q)
      ),
    [all, block, q]
  );
  // Days picked (?day=2026-11-02,2026-11-01): any number of them; none means every day.
  const picked = useMemo(() => new Set((params.get('day') || '').split(',').filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))), [params]);
  const day = [...picked].sort().reverse().join(',');
  const toggleDay = (d: string) => {
    const next = new Set(picked);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setParams({ day: next.size ? [...next].sort().reverse().join(',') : null }, { replace: true });
  };
  const days = useMemo(() => fruitDays(inScope.filter((r) => !variant || r.variant === variant)), [inScope, variant]);
  const rows = useMemo(
    () => sortFruits(inScope.filter((r) => (!variant || r.variant === variant) && (!picked.size || picked.has(r.date)) && (!gradeF || qcTotal(r).grade === gradeF)), sort, desc),
    [inScope, variant, picked, gradeF, sort, desc]
  );
  const dupes = useMemo(() => likelyDuplicates(all), [all]);
  const dayLabel = useDayLabel();
  // Newest first or by date: a line above each day's fruits (the date column is hidden on a phone).
  const byDay = picked.size !== 1 && (!sort || sort === 'date');
  const sum = summarizeFruits(rows);
  const varieties = useMemo(() => byVariety(inScope), [inScope]);
  const codes = useMemo(() => {
    const seen = new Set(all.map((r) => r.variant).filter(Boolean) as string[]);
    variants.forEach((v) => seen.add(v.code));
    return [...seen].sort((a, b) => name(a).localeCompare(name(b)));
  }, [all, variants, name]);
  const filtered = !!(q || variant || block || day || gradeF);
  const gradeCount = useMemo(() => {
    const m = new Map<Grade, number>();
    for (const r of rows) m.set(qcTotal(r).grade, (m.get(qcTotal(r).grade) || 0) + 1);
    return m;
  }, [rows]);


  const exportCsv = () => {
    const head = [t('fr.col.code'), t('fr.col.tree'), t('common.block'), t('fr.col.variant'), t('fr.variant'), t('fr.col.date'), t('fr.col.weight'), t('fr.col.aroma'), t('fr.col.skin'), t('fr.col.shape'), t('qc.score'), t('qc.grade'), t('qc.note')];
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

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs grid grid-cols-2 lg:grid-cols-[1fr_12rem_10rem_10rem] gap-2">
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
        <select value={gradeF} onChange={(e) => setParams({ grade: e.target.value || null })} aria-label={t('qc.grade')} className={`${inputCls} col-span-2 lg:col-span-1`}>
          <option value="">{t('qc.allGrades')}</option>
          {GRADES_ORDER.map((g) => (
            <option key={g} value={g}>
              {t(`qc.grade.${g}`)}
            </option>
          ))}
        </select>
        <DayCalendar days={days} picked={picked} onToggle={toggleDay} onClear={() => setParams({ day: null }, { replace: true })} />
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


      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-600 bg-white rounded-xl border border-slate-200 space-y-3">
          <p>{all.length ? t('fr.noMatch') : t('fr.none')}</p>
          {filtered && (
            <button type="button" onClick={() => setParams({ q: null, variant: null, block: null, day: null, grade: null })} className={btnSecondary}>
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
                {head('score', t('qc.grade'), false)}
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((r, i) => (
                <React.Fragment key={r.key}>
                {byDay && r.date !== rows[i - 1]?.date && (
                  <tr>
                    <td colSpan={9} className="p-0 bg-slate-100 border-b border-slate-200">
                      <span className="sticky left-0 inline-flex items-baseline gap-2 px-2.5 py-1.5 text-xs">
                        <strong className="text-slate-900">{dayLabel(r.date)}</strong>
                        <span className="text-slate-600 tabular">
                          {(() => {
                            const d = days.find((x) => x.date === r.date);
                            return d ? `${t('fr.dayN', { n: d.n })} · ${fmt(d.g / 1000, 1)} kg` : '';
                          })()}
                        </span>
                      </span>
                    </td>
                  </tr>
                )}
                <tr className="group hover:bg-slate-50">
                  {/* The code stays in view while the table scrolls sideways on a phone. */}
                  <td className={`${td} sticky left-0 z-[1] bg-white group-hover:bg-slate-50`}>
                    <Link to={fruitUrl(r.key)} title={r.code} className="font-mono text-xs font-semibold text-emerald-800 hover:underline">
                      {r.code ? shortCode(r.code) : `${r.treeId || '—'} #${r.index + 1}`}
                    </Link>
                    {dupes.has(r.key) && (
                      <span className="ml-1.5 px-1 rounded bg-amber-100 text-amber-900 text-[10px] font-bold" title={t('fr.dup', { code: dupes.get(r.key)! })}>
                        2×?
                      </span>
                    )}
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
                  <td className={td}>
                    {(() => {
                      const q = qcTotal(r);
                      return (
                        <Link to={fruitUrl(r.key)} title={q.complete ? undefined : t('qc.progress', { n: q.scored, total: CRITERIA.length })}>
                          <GradeTag grade={q.grade} pct={q.pct} />
                        </Link>
                      );
                    })()}
                  </td>
                </tr>
                </React.Fragment>
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
                  <td className="px-2.5 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">
                    {GRADES_ORDER.filter((g) => g !== 'ungraded' && gradeCount.get(g)).map((g) => `${gradeCount.get(g)} ${t(`qc.grade.${g}`)}`).join(' · ')}
                  </td>
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
  const twinOf = likelyDuplicates(all).get(f.key);
  const remove = async () => {
    if (!window.confirm(t(siblings.length > 1 ? 'fr.remove.confirm' : 'fr.remove.confirmLast', { code: f.code || f.key }))) return;
    try {
      await removeHarvestFruit(h, f.index);
      goBack(fruitsUrl());
    } catch (e: any) {
      console.error('Fruit remove failed:', e);
      setError(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('fr.saveError'));
    }
  };
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
      // Corrected weight and scores; the rest of the fruit (management's grading) stays.
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
      {/* overflow-clip, not hidden: the grading bar sticks to the bottom of the screen. */}
      <article className="bg-white rounded-xl border border-slate-200 overflow-clip">
        {twinOf && (
          <p role="note" className="px-4 sm:px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-sm text-amber-900">
            {t('fr.dup.long', { code: twinOf })}
          </p>
        )}
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
            <div className="space-y-2">
              <p className="leading-none">
                <span className="text-xs text-slate-500 block mb-1">{t('fr.col.weight')}</span>
                <span className="text-2xl font-bold tabular text-slate-900">{Math.round(f.weightG).toLocaleString(locale)}</span>
              </p>
              <ScoreLine scores={{ aroma: f.aroma, skin: f.skin, shape: f.shape }} size="lg" />
            </div>
          )}
        </section>

        <QcSection f={f} all={all} />

        {siblings.length > 1 && (
          <section className="p-4 sm:p-5 border-t border-slate-100 space-y-2">
            <h2 className="text-sm font-bold text-slate-900">{t('fr.siblings')}</h2>
            <ul className="flex flex-wrap gap-1.5">
              {siblings
                .filter((r) => r.key !== f.key)
                .map((r) => (
                  <li key={r.key}>
                    <Link to={fruitUrl(r.key)} replace className="min-h-9 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-emerald-800">{r.code ? shortCode(r.code) : `#${r.index + 1}`}</span>
                      <span className="tabular text-slate-600">{Math.round(r.weightG).toLocaleString(locale)}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        )}

        <footer className="px-4 sm:px-5 py-3 border-t border-slate-100 text-sm flex flex-wrap items-center justify-between gap-2">
          <Link to={reportUrl(`harvest:${h.id}`)} className="font-semibold text-emerald-700 hover:underline min-h-9 inline-flex items-center">
            {t('fr.harvest.open', { n: siblings.length })}
          </Link>
          <button type="button" onClick={remove} className="min-h-9 px-3 rounded-lg text-sm font-semibold text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1.5">
            <Trash2 className="w-4 h-4" />
            {t('fr.remove')}
          </button>
        </footer>
      </article>
    </div>
  );
};


/**
 * Management's grading of one fruit, made for a phone: the five groups of the harvest report, each criterion a row of
 * five big buttons (1 = the second word, 5 = the first: "Bersih / Cacat"), the worker's aroma, kulit and bentuk shown
 * as scored; a note; the total and grade live at the bottom, saved together. Then on to the next ungraded fruit.
 */
const QcSection: React.FC<{ f: FruitRow; all: FruitRow[] }> = ({ f, all }) => {
  const { t, locale } = useT();
  const { harvests } = useFarm();
  const [qc, setQc] = useState<Partial<Record<QcKey, number>>>(f.qc || {});
  const [note, setNote] = useState(f.qcNote || '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => {
    setQc(f.qc || {});
    setNote(f.qcNote || '');
    setState('idle');
  }, [f.key]);
  const draft = { ...f, qc };
  const total = qcTotal(draft);
  const changed = JSON.stringify(qc) !== JSON.stringify(f.qc || {}) || note.trim() !== (f.qcNote || '');
  const next = all
    .filter((r) => r.key !== f.key && !qcTotal(r).complete)
    .sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))[0];
  const save = async () => {
    setState('saving');
    try {
      const h = harvests.find((x) => x.id === f.harvest.id) || f.harvest;
      const items = [...(h.items || [])];
      const clean = Object.fromEntries(Object.entries(qc).filter(([, v]) => typeof v === 'number'));
      const { qcNote: _n, ...rest } = items[f.index];
      items[f.index] = { ...rest, qc: clean, qcAt: new Date().toISOString(), ...(note.trim() ? { qcNote: note.trim().slice(0, 300) } : {}) };
      await updateHarvestItems(h.id, items);
      setState('saved');
    } catch (e) {
      console.error('Grading save failed:', e);
      setState('error');
    }
  };
  const tone = (on: boolean, v: number) =>
    on ? (v >= 4 ? 'bg-emerald-600 text-white border-emerald-600' : v === 3 ? 'bg-amber-500 text-white border-amber-500' : 'bg-rose-600 text-white border-rose-600') : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50';
  return (
    <section aria-labelledby="qc-h" className="border-t border-slate-100">
      <div className="px-4 sm:px-5 pt-4 pb-2 flex items-center justify-between gap-2">
        <h2 id="qc-h" className="text-sm font-bold text-slate-900">{t('qc.title')}</h2>
        <GradeTag grade={total.grade} pct={total.pct} size="lg" />
      </div>
      <p className="px-4 sm:px-5 pb-2 text-xs text-slate-500">{t('qc.desc', { high: GRADE_FROM.high, mid: GRADE_FROM.mid })}</p>
      {GROUPS.map((g) => {
        const list = CRITERIA.filter((c) => c.group === g);
        return (
          <fieldset key={g} className="px-4 sm:px-5 py-2 border-t border-slate-100">
            <legend className="sr-only">{t(`qc.g.${g}`)}</legend>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 pt-2 pb-1">
              {t(`qc.g.${g}`)} <span className="font-normal normal-case">· {list.reduce((n, c) => n + c.weight, 0)}%</span>
            </p>
            {list.map((c) => {
              const v = scoreOf(draft, c);
              return (
                <div key={c.key} className="py-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {t(`qc.c.${c.key}`)} <span className="text-xs font-normal text-slate-500">{c.weight}%</span>
                    </span>
                    <span className="text-[11px] text-slate-500 text-right">{t(`qc.c.${c.key}.scale`)}</span>
                  </div>
                  {c.from ? (
                    <p className="mt-1 text-xs text-slate-500">{v !== undefined ? t('qc.fromWorker', { v }) : t('qc.fromWorker.none')}</p>
                  ) : (
                    <div role="radiogroup" aria-label={t(`qc.c.${c.key}`)} className="mt-1 grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={v === n}
                          onClick={() => {
                            setQc((x) => (x[c.key] === n ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== c.key)) : { ...x, [c.key]: n }));
                            setState('idle');
                          }}
                          className={`h-11 rounded-lg border text-base font-bold tabular ${tone(v === n, n)}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>
        );
      })}
      <div className="px-4 sm:px-5 py-3 border-t border-slate-100">
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-800">{t('qc.note')}</span>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setState('idle');
            }}
            rows={2}
            maxLength={300}
            placeholder={t('qc.note.ph')}
            className={`${inputCls} !h-auto py-2`}
          />
        </label>
      </div>
      {/* Stays at the bottom of the screen while scoring: the total so far and saving. */}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 z-10 px-4 sm:px-5 py-2.5 border-t border-slate-200 bg-white/95 backdrop-blur flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-700 tabular mr-auto">
          {t('qc.total')} <strong className="text-slate-900">{total.pct.toLocaleString(locale, { maximumFractionDigits: 1 })}%</strong>
          <span className="text-xs text-slate-500"> · {t('qc.progress', { n: total.scored, total: CRITERIA.length })}</span>
        </span>
        {state === 'saved' && !changed && next ? (
          <Link to={fruitUrl(next.key)} replace className={btnPrimary}>
            {t('qc.next', { code: next.code ? shortCode(next.code) : next.key })}
          </Link>
        ) : (
          <button type="button" onClick={save} disabled={!changed || state === 'saving'} className={btnPrimary}>
            {state === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : state === 'saved' && !changed ? <Check className="w-4 h-4" /> : null}
            {state === 'saved' && !changed ? t('qc.saved') : t('fr.save')}
          </button>
        )}
        {state === 'error' && <span role="alert" className="w-full text-xs text-rose-700">{t('fr.saveError')}</span>}
      </div>
    </section>
  );
};
