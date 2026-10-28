import React from 'react';
import { useT } from '../i18n';
import { GRADES, type Harvest, harvestScores } from '../lib/fieldData';

/** How a 1-5 score reads: 4-5 good (green), 3 middling (amber), 1-2 poor (red); averages split at 3.5 and 2.5. */
export const scoreTone = (v: number) => (v >= 3.5 ? 'good' : v >= 2.5 ? 'mid' : 'poor');
const FILL = { good: 'bg-emerald-600', mid: 'bg-amber-500', poor: 'bg-rose-500' } as const;

/** A 1-5 score as five steps, filled up to the score (3,2 fills three and a fifth); the colour says how good it is. */
export const ScoreMeter: React.FC<{ v: number; track?: string }> = ({ v, track = 'bg-slate-200' }) => (
  <span className="grid grid-cols-5 gap-0.5 w-full" aria-hidden>
    {[0, 1, 2, 3, 4].map((i) => (
      <span key={i} className={`h-2 rounded-sm overflow-hidden ${track}`}>
        <span className={`block h-full ${FILL[scoreTone(v)]}`} style={{ width: `${Math.max(0, Math.min(1, v - i)) * 100}%` }} />
      </span>
    ))}
  </span>
);

/**
 * Aroma, kulit and bentuk, one line each: the name, the five steps, the value. The same on a harvest card, Today and
 * a fruit's page; tables use ScoreChip, coloured alike.
 */
export const ScoreMeters: React.FC<{ scores: { aroma: number; skin: number; shape: number }; track?: string; large?: boolean }> = ({ scores, track, large }) => {
  const { t, locale } = useT();
  const rows: Array<[string, number]> = [
    [t('hv.col.aroma'), scores.aroma],
    [t('hv.col.skin'), scores.skin],
    [t('hv.col.shape'), scores.shape],
  ];
  return (
    <dl className={large ? 'space-y-2.5' : 'space-y-1.5'}>
      {rows.map(([label, v]) => (
        <div key={label} className={`grid items-center gap-3 ${large ? 'grid-cols-[4.5rem_1fr_2.5rem] text-sm' : 'grid-cols-[3.75rem_1fr_2rem] text-xs'}`}>
          <dt className="text-slate-600">{label}</dt>
          <dd>
            <ScoreMeter v={v} track={track} />
          </dd>
          <dd className="text-right font-bold tabular text-slate-900">{v.toLocaleString(locale, { maximumFractionDigits: 1 })}</dd>
        </div>
      ))}
    </dl>
  );
};

const WEIGHTS_SHOWN = 8;

/**
 * In place of photos on a harvest card: the harvest at a glance. The fruit count is the headline, the weight under
 * it; then (Laporan PANEN) the three scores as meters and each fruit's weight in one line; a harvest written in a
 * report shows its grades instead. Spread over the whole tile, so cards line up with photo cards.
 */
export const HarvestTile: React.FC<{ harvest: Harvest }> = ({ harvest: h }) => {
  const { t, locale } = useT();
  const kg = (n: number, d = 1) => n.toLocaleString(locale, { maximumFractionDigits: d });
  const items = (h.items || []).filter((f) => f && Number.isFinite(f.weightG));
  const scores = harvestScores(items);
  const avgKg = items.length ? items.reduce((s, f) => s + f.weightG, 0) / items.length / 1000 : h.weightKg && h.fruits ? h.weightKg / h.fruits : 0;
  const grades = GRADES.filter((g) => h.grades?.[g]);
  const weights = items.slice(0, WEIGHTS_SHOWN).map((f) => kg(f.weightG / 1000));
  return (
    <div className="aspect-[4/3] bg-emerald-50 px-5 py-4 flex flex-col justify-between gap-3" aria-hidden>
      <div>
        <p className="leading-none text-emerald-950">
          <span className="text-4xl font-bold tabular">{h.fruits}</span>
          <span className="ml-1.5 text-base font-semibold">{t('hv2.fruit')}</span>
        </p>
        {!!h.weightKg && (
          <p className="mt-1.5 text-sm text-emerald-900 tabular">
            <span className="font-semibold">{kg(h.weightKg, 2)} kg</span>
            {avgKg > 0 && h.fruits > 1 && <span className="text-emerald-800/80"> · {t('hv.tile.each', { kg: kg(avgKg, 2) })}</span>}
          </p>
        )}
      </div>
      {scores ? <ScoreMeters scores={scores} track="bg-white" /> : <span />}
      {!items.length && grades.length > 0 ? (
        <p className="text-sm text-emerald-900">{grades.map((g) => `${t(`grade.${g}`)} ${h.grades![g]}`).join(' · ')}</p>
      ) : items.length > 1 ? (
        <p className="text-xs text-emerald-900/80 tabular truncate">
          {t('hv.tile.weights')}: {weights.join(' · ')} kg{items.length > WEIGHTS_SHOWN ? ` +${items.length - WEIGHTS_SHOWN}` : ''}
        </p>
      ) : (
        <span />
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
