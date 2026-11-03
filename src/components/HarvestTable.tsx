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

/**
 * Laporan PANEN as a table, the look of the fruits table: newest first, a line above each day with its fruit and
 * kilos, then one row per report: tree, variety, fruit, kilos, the average weight and scores, who sent it. A row
 * opens the report. On a phone the variety and sender columns are left out and the tree stays in view.
 */
export const HarvestTable: React.FC<{ entries: LogEntry[] }> = ({ entries }) => {
  const { t, locale } = useT();
  const { workerLabel } = useFarm();
  const rows = useMemo(
    () => (entries.filter((e) => e.kind === 'harvest') as HarvestEntry[]).sort((a, b) => b.rec.date.localeCompare(a.rec.date) || b.at - a.at),
    [entries]
  );
  const days = useMemo(() => {
    const m = new Map<string, { n: number; kg: number }>();
    for (const e of rows) {
      const d = m.get(e.rec.date) || { n: 0, kg: 0 };
      d.n += e.rec.fruits || 0;
      d.kg += e.rec.weightKg || 0;
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
            <th scope="col" className={`${th} text-right`}>kg</th>
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
                      <span className="sticky left-0 inline-flex items-baseline gap-2 px-2.5 py-1.5 text-xs">
                        <strong className="text-slate-900">{dayLabel(h.date)}</strong>
                        {d && (
                          <span className="text-slate-600">
                            {t('fr.dayN', { n: num(d.n) })} · {num(d.kg, 1)} kg
                          </span>
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
                  <td className={`${td} text-right text-slate-800`}>{h.weightKg ? num(h.weightKg, 2) : ''}</td>
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
