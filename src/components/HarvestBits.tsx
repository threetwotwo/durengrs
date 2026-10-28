import React from 'react';
import { useT } from '../i18n';
import { GRADES, type Harvest, harvestScores } from '../lib/fieldData';

/** How a 1-5 score reads: 4-5 good (green), 3 middling (amber), 1-2 poor (red); averages split at 3.5 and 2.5. */
export const scoreTone = (v: number) => (v >= 3.5 ? 'good' : v >= 2.5 ? 'mid' : 'poor');
// Rows that fit on the tile; with more fruits the last row says how many more.
const TILE_ROWS = 5;

/**
 * In place of photos on a harvest card, the per-fruit table small: a headline (fruit, kilos), one row per fruit
 * (number, weight, aroma, kulit, bentuk as chips), the averages at the bottom. A harvest written in a report has no
 * fruits: its grades instead.
 */
export const HarvestTile: React.FC<{ harvest: Harvest }> = ({ harvest: h }) => {
  const { t, locale } = useT();
  const kg = (n: number, d = 2) => n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  const items = (h.items || []).filter((f) => f && Number.isFinite(f.weightG));
  const scores = harvestScores(items);
  const grades = GRADES.filter((g) => h.grades?.[g]);
  const shown = items.length > TILE_ROWS ? items.slice(0, TILE_ROWS - 1) : items;
  const more = items.length - shown.length;
  const th = 'px-1.5 first:pl-3 last:pr-3 py-1.5 text-[11px] font-semibold text-slate-500';
  const td = 'px-1.5 first:pl-3 last:pr-3 py-1';
  return (
    <div className="aspect-[4/3] bg-white border-b border-slate-100 flex flex-col overflow-hidden" aria-hidden>
      <p className="px-3 pt-3 pb-2 flex items-baseline gap-1.5 text-slate-900">
        <span className="text-2xl font-bold tabular leading-none">{h.fruits}</span>
        <span className="text-sm font-semibold">{t('hv2.fruit')}</span>
        {!!h.weightKg && <span className="text-sm text-slate-500 tabular">· {kg(h.weightKg, h.weightKg % 1 ? 2 : 0)} kg</span>}
      </p>
      {items.length > 0 ? (
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-y border-slate-200">
            <tr>
              <th className={`${th} text-left`}>#</th>
              <th className={`${th} text-right`}>{t('hv.col.weight')}</th>
              <th className={`${th} text-center`}>{t('hv.col.aroma')}</th>
              <th className={`${th} text-center`}>{t('hv.col.skin')}</th>
              <th className={`${th} text-center`}>{t('hv.col.shape')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((f, i) => (
              <tr key={f.code || i}>
                <td className={`${td} font-mono font-bold text-emerald-800`}>{f.code ? f.code.split('-').pop() : i + 1}</td>
                <td className={`${td} text-right font-semibold tabular text-slate-900`}>{kg(f.weightG / 1000)} kg</td>
                <td className={`${td} text-center`}><ScoreChip v={f.aroma} size="sm" /></td>
                <td className={`${td} text-center`}><ScoreChip v={f.skin} size="sm" /></td>
                <td className={`${td} text-center`}><ScoreChip v={f.shape} size="sm" /></td>
              </tr>
            ))}
            {more > 0 && (
              <tr>
                <td colSpan={5} className={`${td} text-slate-500`}>{t('hv.tile.more', { n: more })}</td>
              </tr>
            )}
          </tbody>
          {scores && items.length > 1 && (
            <tfoot className="bg-slate-50 border-t border-slate-200">
              <tr>
                <th className={`${td} text-left text-[11px] font-semibold text-slate-600`}>{t('fr.avg')}</th>
                <td className={`${td} text-right font-semibold tabular text-slate-700`}>{kg(items.reduce((s, f) => s + f.weightG, 0) / items.length / 1000)} kg</td>
                <td className={`${td} text-center`}><ScoreChip v={scores.aroma} avg size="sm" /></td>
                <td className={`${td} text-center`}><ScoreChip v={scores.skin} avg size="sm" /></td>
                <td className={`${td} text-center`}><ScoreChip v={scores.shape} avg size="sm" /></td>
              </tr>
            </tfoot>
          )}
        </table>
      ) : grades.length > 0 ? (
        <ul className="border-t border-slate-200 divide-y divide-slate-100 text-sm">
          {grades.map((g) => (
            <li key={g} className="px-3 py-1.5 flex justify-between">
              <span className="text-slate-600">{t(`grade.${g}`)}</span>
              <span className="font-semibold tabular text-slate-900">{h.grades![g]}</span>
            </li>
          ))}
        </ul>
      ) : null}
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

const CHIP_TONE = { good: 'bg-emerald-100 text-emerald-800', mid: 'bg-amber-100 text-amber-900', poor: 'bg-rose-100 text-rose-800' } as const;
const CHIP_SIZE = { sm: 'min-w-6 h-5 px-1 text-[11px]', md: 'min-w-7 h-6 px-1.5 text-xs', lg: 'min-w-9 h-8 px-2 text-sm' } as const;

/**
 * A 1-5 score as a small box, the one look for scores everywhere: a fruit's own score coloured (4-5 green, 3 amber,
 * 1-2 red), an average (`avg`) plain grey, as in the per-fruit table's last row.
 */
export const ScoreChip: React.FC<{ v: number; avg?: boolean; size?: keyof typeof CHIP_SIZE }> = ({ v, avg, size = 'md' }) => {
  const { locale } = useT();
  const tone = avg ? 'bg-slate-100 text-slate-800' : CHIP_TONE[scoreTone(v)];
  return (
    <span className={`inline-flex items-center justify-center rounded-md font-semibold tabular ${CHIP_SIZE[size]} ${tone}`}>
      {v.toLocaleString(locale, { maximumFractionDigits: 1 })}
    </span>
  );
};

/** The three scores in a row, each its name and a chip: "Aroma [3,8]  Kulit [3,6]  Bentuk [4]". */
export const ScoreLine: React.FC<{ scores: { aroma: number; skin: number; shape: number }; avg?: boolean; size?: keyof typeof CHIP_SIZE }> = ({ scores, avg, size = 'md' }) => {
  const { t } = useT();
  const rows: Array<[string, number]> = [
    [t('hv.col.aroma'), scores.aroma],
    [t('hv.col.skin'), scores.skin],
    [t('hv.col.shape'), scores.shape],
  ];
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1.5">
      {rows.map(([label, v]) => (
        <div key={label} className="flex items-center gap-2">
          <dt className={size === 'lg' ? 'text-sm text-slate-600' : 'text-xs text-slate-500'}>{label}</dt>
          <dd>
            <ScoreChip v={v} avg={avg} size={size} />
          </dd>
        </div>
      ))}
    </dl>
  );
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
