import React, { useMemo } from 'react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { harvestScores } from '../lib/fieldData';
import type { LogEntry } from '../lib/fieldLog';
import { navigate, treeUrl } from '../lib/router';
import { diffDays, todayStr } from '../lib/treatments';
import { Link } from './Link';
import { recordUrl } from './LogParts';
import { ScoreChip } from './HarvestBits';

type HarvestEntry = Extract<LogEntry, { kind: 'harvest' }>;

/** A report's grams: its fruits' weights when it has them, else its kilos. */
const grams = (h: HarvestEntry['rec']) => {
  const items = (h.items || []).filter((f) => f && Number.isFinite(f.weightG));
  return items.length ? items.reduce((s, f) => s + f.weightG, 0) : Math.round((h.weightKg || 0) * 1000);
};

/**
 * Laporan PANEN as a table, the look of the fruits table: newest first, a line above each day with its grams and
 * fruit, in all and per variety, then one row per report: tree, variety, fruit, grams, the average weight and
 * scores, who sent it. A row
 * opens the report. On a phone the variety and sender columns are left out and the tree stays in view.
 */
export const HarvestTable: React.FC<{ entries: LogEntry[] }> = ({ entries }) => {
  const { t, locale } = useT();
  const { workerLabel } = useFarm();
  const rows = useMemo(
    () => (entries.filter((e) => e.kind === 'harvest') as HarvestEntry[]).sort((a, b) => b.rec.date.localeCompare(a.rec.date) || b.at - a.at),
    [entries]
  );
  // Each day's fruit and grams, in all and per variety (MK 3 · 4.300 g).
  const days = useMemo(() => {
    const m = new Map<string, { n: number; g: number; byVariety: Map<string, { n: number; g: number }> }>();
    for (const e of rows) {
      const d = m.get(e.rec.date) || { n: 0, g: 0, byVariety: new Map() };
      const g = grams(e.rec);
      d.n += e.rec.fruits || 0;
      d.g += g;
      const key = e.rec.variant || '—';
      const v = d.byVariety.get(key) || { n: 0, g: 0 };
      v.n += e.rec.fruits || 0;
      v.g += g;
      d.byVariety.set(key, v);
      m.set(e.rec.date, d);
    }
    return m;
  }, [rows]);
  const today = todayStr();
  const dayLabel = (d: string) => {
    const n = diffDays(today, d);
    if (n === 0) return t('fr.today');
    if (n === 1) return t('fr.yesterday');
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const num = (n: number, d = 0) => n.toLocaleString(locale, { maximumFractionDigits: d });
  if (!rows.length) return null;

  const th = 'px-2.5 h-10 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap bg-slate-900 text-slate-200';
  const td = 'px-2.5 py-2 border-b border-slate-100 whitespace-nowrap';
  const wide = 'hidden sm:table-cell';
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th scope="col" className={`${th} text-left sticky left-0 z-10`}>{t('fr.col.tree')}</th>
            <th scope="col" className={`${th} text-left ${wide}`}>{t('fr.col.variant')}</th>
            <th scope="col" className={`${th} text-right`}>{t('hv2.fruit')}</th>
            <th scope="col" className={`${th} text-right`}>{t('fr.col.weight')}</th>
            <th scope="col" className={`${th} text-right`}>{t('fr.col.avgWeight')}</th>
            <th scope="col" className={`${th} text-center`}>{t('fr.col.aroma')}</th>
            <th scope="col" className={`${th} text-center`}>{t('fr.col.skin')}</th>
            <th scope="col" className={`${th} text-center`}>{t('fr.col.shape')}</th>
            <th scope="col" className={`${th} text-left ${wide}`}>{t('fr.by')}</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((e, i) => {
            const h = e.rec;
            const items = (h.items || []).filter((f) => f && Number.isFinite(f.weightG));
            const sc = harvestScores(items);
            const avgG = items.length ? items.reduce((s, f) => s + f.weightG, 0) / items.length : h.weightKg && h.fruits ? (h.weightKg * 1000) / h.fruits : undefined;
            const href = recordUrl(e);
            const d = days.get(h.date);
            return (
              <React.Fragment key={e.key}>
                {h.date !== rows[i - 1]?.rec.date && (
                  <tr>
                    <td colSpan={9} className="p-0 bg-slate-100 border-b border-slate-200">
                      {/* The day's total in grams, large, then each variety's. */}
                      <span className="sticky left-0 flex w-fit max-w-[calc(100vw-3rem)] flex-wrap items-center gap-x-3 gap-y-1.5 px-2.5 py-2">
                        <strong className="text-sm text-slate-900">{dayLabel(h.date)}</strong>
                        {d && (
                          <>
                            <span className="text-base font-bold text-slate-900 tabular">
                              {num(d.g)} g <span className="text-xs font-semibold text-slate-600">· {t('fr.dayN', { n: num(d.n) })}</span>
                            </span>
                            {[...d.byVariety.entries()]
                              .sort((a, b) => b[1].g - a[1].g)
                              .map(([v, x]) => (
                                <span key={v} className="inline-flex items-baseline gap-1.5 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs tabular">
                                  <strong className="text-emerald-900">{v}</strong>
                                  <span className="text-slate-700">{num(x.n)} · {num(x.g)} g</span>
                                </span>
                              ))}
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                )}
                <tr onClick={() => navigate(href)} className="group cursor-pointer hover:bg-slate-50">
                  <td className={`${td} sticky left-0 z-[1] bg-white group-hover:bg-slate-50`}>
                    {h.treeId ? (
                      <Link to={treeUrl(h.treeId)} onClick={(ev) => ev.stopPropagation()} className="font-mono font-bold text-slate-900 hover:underline">
                        {h.treeId}
                      </Link>
                    ) : (
                      <span className="font-semibold text-slate-700">{t('common.blockN', { n: h.block })}</span>
                    )}
                  </td>
                  <td className={`${td} ${wide} text-slate-700`}>{h.variant || '—'}</td>
                  <td className={`${td} text-right font-semibold text-slate-900`}>
                    <Link to={href} onClick={(ev) => ev.stopPropagation()} className="hover:underline">
                      {num(h.fruits || 0)}
                    </Link>
                  </td>
                  <td className={`${td} text-right text-slate-800`}>{grams(h) ? num(grams(h)) : ''}</td>
                  <td className={`${td} text-right text-slate-800`}>{avgG ? num(avgG) : ''}</td>
                  <td className={`${td} text-center`}>{sc ? <ScoreChip v={sc.aroma} /> : ''}</td>
                  <td className={`${td} text-center`}>{sc ? <ScoreChip v={sc.skin} /> : ''}</td>
                  <td className={`${td} text-center`}>{sc ? <ScoreChip v={sc.shape} /> : ''}</td>
                  <td className={`${td} ${wide} text-slate-600 text-xs`}>{e.who ? workerLabel(e.who) : ''}</td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
