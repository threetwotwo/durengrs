import React from 'react';
import { useT } from '../i18n';
import { GRADES, type Harvest, harvestScores } from '../lib/fieldData';

/** Aroma, kulit and bentuk on a 1-5 scale, as three short bars with the value. */
export const ScoreBars: React.FC<{ scores: { aroma: number; skin: number; shape: number }; compact?: boolean }> = ({ scores, compact }) => {
  const { t, locale } = useT();
  const rows: Array<[string, number]> = [
    [t('hv.col.aroma'), scores.aroma],
    [t('hv.col.skin'), scores.skin],
    [t('hv.col.shape'), scores.shape],
  ];
  return (
    <dl className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {rows.map(([label, v]) => (
        <div key={label} className="grid grid-cols-[3.75rem_1fr_2rem] items-center gap-2 text-xs">
          <dt className="text-slate-600">{label}</dt>
          <dd className="h-2 rounded-full bg-white/80 ring-1 ring-inset ring-emerald-900/10 overflow-hidden">
            <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${Math.max(0, Math.min(1, v / 5)) * 100}%` }} />
          </dd>
          <dd className="text-right font-semibold tabular text-slate-800">{v.toLocaleString(locale, { maximumFractionDigits: 1 })}</dd>
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
    <div className="aspect-[4/3] bg-emerald-50 text-emerald-900 p-4 flex flex-col gap-3" aria-hidden>
      <div className="flex items-end justify-between gap-2">
        <p className="leading-none">
          <span className="text-4xl font-bold tabular">{h.fruits}</span>
          <span className="ml-1.5 text-sm font-semibold">{t('hv2.fruit')}</span>
        </p>
        {!!h.weightKg && (
          <p className="text-right leading-tight">
            <span className="block text-xl font-bold tabular">{kg(h.weightKg, 2)} kg</span>
            {avgKg > 0 && <span className="block text-[11px] text-emerald-800/80">{t('hv.tile.avg', { kg: kg(avgKg, 2) })}</span>}
          </p>
        )}
      </div>
      {scores && <ScoreBars scores={scores} />}
      {items.length > 0 && (
        <ul className="mt-auto flex flex-wrap gap-1">
          {items.slice(0, WEIGHTS_SHOWN).map((f, i) => (
            <li key={f.code || i} className="px-1.5 py-0.5 rounded bg-white/80 text-[11px] font-semibold tabular text-emerald-900">
              {kg(f.weightG / 1000)} kg
            </li>
          ))}
          {items.length > WEIGHTS_SHOWN && <li className="px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">+{items.length - WEIGHTS_SHOWN}</li>}
        </ul>
      )}
      {!items.length && grades.length > 0 && (
        <ul className="mt-auto flex flex-wrap gap-1">
          {grades.map((g) => (
            <li key={g} className="px-1.5 py-0.5 rounded bg-white/80 text-[11px] font-semibold text-emerald-900">
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
