import React from 'react';
import { useT } from '../i18n';
import { GRADES, type Harvest, harvestScores } from '../lib/fieldData';

/** How a 1-5 score reads: 4-5 good (green), 3 middling (amber), 1-2 poor (red); averages split at 3.5 and 2.5. */
export const scoreTone = (v: number) => (v >= 3.5 ? 'good' : v >= 2.5 ? 'mid' : 'poor');
const BOX_TONE = {
  good: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  mid: 'bg-amber-50 border-amber-200 text-amber-900',
  poor: 'bg-rose-50 border-rose-200 text-rose-900',
} as const;

/** The three scores as boxes: label, the value large, out of 5; coloured by how good it is. */
export const ScoreBoxes: React.FC<{ scores: { aroma: number; skin: number; shape: number }; size?: 'sm' | 'md' }> = ({ scores, size = 'md' }) => {
  const { t, locale } = useT();
  const rows: Array<[string, number]> = [
    [t('hv.col.aroma'), scores.aroma],
    [t('hv.col.skin'), scores.skin],
    [t('hv.col.shape'), scores.shape],
  ];
  return (
    <dl className="grid grid-cols-3 gap-2">
      {rows.map(([label, v]) => (
        <div key={label} className={`rounded-lg border ${size === 'sm' ? 'px-2 py-1.5' : 'px-2.5 py-2'} ${BOX_TONE[scoreTone(v)]}`}>
          <dt className="text-[11px] font-medium opacity-80">{label}</dt>
          <dd className="leading-tight tabular">
            <span className={`${size === 'sm' ? 'text-base' : 'text-xl'} font-bold`}>{v.toLocaleString(locale, { maximumFractionDigits: 1 })}</span>
            <span className="text-xs opacity-60">/5</span>
          </dd>
        </div>
      ))}
    </dl>
  );
};

const WEIGHTS_SHOWN = 8;

/**
 * In place of photos on a harvest card: the harvest at a glance. Fruit and kilos large, then (Laporan PANEN) the
 * average scores as bars and each fruit's weight; a harvest written in a report shows its grades instead.
 */
export const HarvestTile: React.FC<{ harvest: Harvest }> = ({ harvest: h }) => {
  const { t, locale } = useT();
  const kg = (n: number, d = 1) => n.toLocaleString(locale, { maximumFractionDigits: d });
  const items = (h.items || []).filter((f) => f && Number.isFinite(f.weightG));
  const scores = harvestScores(items);
  const avgKg = items.length ? items.reduce((s, f) => s + f.weightG, 0) / items.length / 1000 : h.weightKg && h.fruits ? h.weightKg / h.fruits : 0;
  const grades = GRADES.filter((g) => h.grades?.[g]);
  return (
    <div className="aspect-[4/3] bg-emerald-50 text-emerald-950 px-5 py-4 flex flex-col justify-center gap-3.5" aria-hidden>
      <dl className="grid grid-cols-3 gap-2">
        {(
          [
            [t('rec.f.fruits'), String(h.fruits)],
            [t('rec.f.weight'), h.weightKg ? `${kg(h.weightKg, 2)} kg` : '—'],
            [t('hv.tile.avgLabel'), avgKg > 0 ? `${kg(avgKg, 2)} kg` : '—'],
          ] as Array<[string, string]>
        ).map(([label, v]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-emerald-800/80 truncate">{label}</dt>
            <dd className="text-xl font-bold tabular leading-tight truncate">{v}</dd>
          </div>
        ))}
      </dl>
      {scores && <ScoreBoxes scores={scores} size="sm" />}
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {items.slice(0, WEIGHTS_SHOWN).map((f, i) => (
            <li key={f.code || i} className="px-1.5 py-0.5 rounded bg-white text-[11px] font-semibold tabular text-emerald-900 ring-1 ring-inset ring-emerald-900/10">
              {kg(f.weightG / 1000)} kg
            </li>
          ))}
          {items.length > WEIGHTS_SHOWN && <li className="px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">+{items.length - WEIGHTS_SHOWN}</li>}
        </ul>
      )}
      {!items.length && grades.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {grades.map((g) => (
            <li key={g} className="px-1.5 py-0.5 rounded bg-white text-[11px] font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-900/10">
              {t(`grade.${g}`)} {h.grades![g]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Totals of a set of harvests: fruit, kilos, trees, and the average scores of the fruits weighed in Laporan PANEN. */
export function harvestTotals(list: Harvest[]) {
  const items = list.flatMap((h) => h.items || []);
  return {
    fruits: list.reduce((n, h) => n + (h.fruits || 0), 0),
    kg: Math.round(list.reduce((n, h) => n + (h.weightKg || 0), 0) * 100) / 100,
    trees: new Set(list.map((h) => h.treeId).filter(Boolean)).size,
    scores: harvestScores(items),
    weighed: items.length,
  };
}

/** A 1-5 score as a small coloured box: 4-5 green, 3 amber, 1-2 red. */
export const ScoreChip: React.FC<{ v: number; avg?: boolean }> = ({ v, avg }) => {
  const { locale } = useT();
  const tone = avg ? 'bg-slate-100 text-slate-800' : { good: 'bg-emerald-100 text-emerald-800', mid: 'bg-amber-100 text-amber-900', poor: 'bg-rose-100 text-rose-800' }[scoreTone(v)];
  return <span className={`inline-flex min-w-7 h-6 px-1.5 items-center justify-center rounded-md text-xs font-semibold tabular ${tone}`}>{v.toLocaleString(locale, { maximumFractionDigits: 1 })}</span>;
};

/** Every fruit of a Laporan PANEN, one row each (opens the fruit), with the averages at the bottom. */
export const FruitTable: React.FC<{ harvest: Harvest; hrefOf: (i: number) => string; onOpen: (href: string) => void }> = ({ harvest: h, hrefOf, onOpen }) => {
  const { t, locale } = useT();
  // Each fruit with its place in the harvest (its address).
  const rows = (h.items || []).map((f, i) => ({ f, i })).filter(({ f }) => f && Number.isFinite(f.weightG));
  const items = rows.map((r) => r.f);
  if (!items.length) return null;
  const kg = (g: number) => `${(g / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
  const sc = harvestScores(items);
  const avgG = items.reduce((s, f) => s + f.weightG, 0) / items.length;
  const th = 'px-2 sm:px-3 py-2 text-xs font-semibold text-slate-500';
  const td = 'px-2 sm:px-3 py-1.5';
  return (
    <section className="space-y-2" aria-labelledby="per-fruit-h">
      <h2 id="per-fruit-h" className="text-sm font-bold text-slate-900">
        {t('hv.perFruit')} <span className="font-normal text-slate-500">· {items.length}</span>
      </h2>
      <div className="rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th scope="col" className={`${th} text-left`}>{items.some((f) => f.code) ? t('hv.col.code') : '#'}</th>
              <th scope="col" className={`${th} text-right`}>{t('hv.col.weight')}</th>
              <th scope="col" className={`${th} text-center`}>{t('hv.col.aroma')}</th>
              <th scope="col" className={`${th} text-center`}>{t('hv.col.skin')}</th>
              <th scope="col" className={`${th} text-center`}>{t('hv.col.shape')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ f, i }) => {
              const href = hrefOf(i);
              const num = f.code ? f.code.split('-').pop() : String(i + 1);
              const prefix = f.code ? f.code.slice(0, f.code.length - (num || '').length) : '';
              return (
                <tr key={f.code || i} onClick={() => onOpen(href)} className="cursor-pointer hover:bg-slate-50">
                  <td className={`${td} whitespace-nowrap`}>
                    <a href={`#${href}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs text-emerald-800 hover:underline" title={f.code}>
                      {prefix ? <span className="hidden sm:inline text-slate-400">{prefix}</span> : null}
                      <span className="sm:hidden text-slate-400">#</span>
                      <span className="font-bold">{num}</span>
                    </a>
                  </td>
                  <td className={`${td} text-right tabular font-semibold text-slate-900 whitespace-nowrap`}>{kg(f.weightG)}</td>
                  <td className={`${td} text-center`}><ScoreChip v={f.aroma} /></td>
                  <td className={`${td} text-center`}><ScoreChip v={f.skin} /></td>
                  <td className={`${td} text-center`}><ScoreChip v={f.shape} /></td>
                </tr>
              );
            })}
          </tbody>
          {sc && (
            <tfoot className="bg-slate-50 border-t border-slate-200">
              <tr>
                <th scope="row" className="px-2 sm:px-3 py-2 text-left text-xs font-semibold text-slate-600">{t('fr.avg')}</th>
                <td className="px-2 sm:px-3 py-2 text-right tabular font-semibold text-slate-700 whitespace-nowrap">{kg(avgG)}</td>
                <td className="px-2 sm:px-3 py-2 text-center"><ScoreChip v={sc.aroma} avg /></td>
                <td className="px-2 sm:px-3 py-2 text-center"><ScoreChip v={sc.skin} avg /></td>
                <td className="px-2 sm:px-3 py-2 text-center"><ScoreChip v={sc.shape} avg /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
};
