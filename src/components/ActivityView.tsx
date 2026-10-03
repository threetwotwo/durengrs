import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db, parseReportDoc } from '../lib/firebase';
import { TreeReport } from '../types';
import { useFarm } from '../context/FarmContext';
import { summariseActivity, maskPhone } from '../lib/insights';
import { Link } from './Link';
import { treesUrl } from '../lib/router';
import { formatTimeAgo } from '../context/FarmContext';

const PERIODS = [7, 14, 30] as const;

/** Who is reporting, how often, and which blocks nobody has looked at. */
export const ActivityView: React.FC = () => {
  const { trees } = useFarm();
  const [reports, setReports] = useState<TreeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(14);

  // One read of the last 30 days (max 1000 reports) when this view opens; the period toggle is local.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const since = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const snap = await getDocs(
          query(collection(db, 'reports'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(1000))
        );
        if (!cancelled) setReports(snap.docs.map(parseReportDoc));
      } catch (e) {
        console.error('Activity load failed:', e);
        if (!cancelled) setError('Could not load activity. Check your connection and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => summariseActivity(reports, trees, period), [reports, trees, period]);
  const maxDay = Math.max(1, ...summary.perDay.map((d) => d.count));
  const treesVisited = summary.perBlock.reduce((n, b) => n + b.reported, 0);
  const treesTotal = summary.perBlock.reduce((n, b) => n + b.total, 0);

  if (loading) return <div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" />;
  if (error) return <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">{error}</div>;

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Period" className="inline-flex p-1 rounded-xl bg-slate-200/70 gap-1">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            aria-pressed={period === p}
            className={`min-h-10 px-4 rounded-lg text-sm font-semibold ${period === p ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Last {p} days
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Reports', value: summary.total, note: `${(summary.total / period).toFixed(1)} per day` },
          { label: 'Active workers', value: summary.perWorker.length, note: 'sent at least one report' },
          { label: 'Trees visited', value: treesVisited, note: `of ${treesTotal} trees` },
          { label: 'Coverage', value: `${treesTotal ? Math.round((treesVisited / treesTotal) * 100) : 0}%`, note: 'trees reported at least once' },
        ].map((k) => (
          <div key={k.label} className="p-4 rounded-xl border border-slate-200 bg-white">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{k.label}</span>
            <span className="block mt-2 text-3xl font-bold tabular text-slate-900">{k.value}</span>
            <span className="block text-xs text-slate-600 mt-0.5">{k.note}</span>
          </div>
        ))}
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-4" aria-labelledby="act-day">
        <h2 id="act-day" className="text-sm font-bold text-slate-900 mb-3">Reports per day</h2>
        <div className="flex items-end gap-1 h-32" role="img" aria-label={`Reports per day over the last ${period} days`}>
          {summary.perDay.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.label}: ${d.count} reports`}>
              {d.count > 0 && <span className="text-[0px] sm:text-xs text-slate-600 tabular mb-0.5">{d.count}</span>}
              <div className={`w-full rounded-t ${d.count > 0 ? 'bg-emerald-500' : 'bg-slate-200'}`} style={{ height: `${d.count > 0 ? Math.max(6, (d.count / maxDay) * 100) : 3}%` }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1.5 tabular">
          <span>{summary.perDay[0]?.label}</span>
          <span>{summary.perDay[summary.perDay.length - 1]?.label}</span>
        </div>
        {summary.perDay.some((d) => d.count === 0) && (
          <p className="text-xs text-slate-600 mt-2">
            {summary.perDay.filter((d) => d.count === 0).length} day(s) with no reports at all.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden" aria-labelledby="act-w">
          <h2 id="act-w" className="px-4 py-3 text-sm font-bold text-slate-900 border-b border-slate-200">By worker</h2>
          {summary.perWorker.length === 0 ? (
            <p className="p-6 text-sm text-slate-600 text-center">No reports in this period.</p>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase tracking-wide text-slate-600 bg-slate-50">
                <tr>
                  <th className="px-4 py-2 font-semibold">Worker</th>
                  <th className="px-3 py-2 font-semibold text-right">Reports</th>
                  <th className="px-3 py-2 font-semibold text-right">Trees</th>
                  <th className="px-3 py-2 font-semibold">Last report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.perWorker.map((w) => (
                  <tr key={w.phone}>
                    <td className="px-4 py-2.5 font-mono text-slate-900">{maskPhone(w.phone)}</td>
                    <td className="px-3 py-2.5 text-right tabular font-semibold">{w.reports}</td>
                    <td className="px-3 py-2.5 text-right tabular">{w.trees}</td>
                    <td className="px-3 py-2.5 text-slate-600 tabular">{formatTimeAgo(w.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3" aria-labelledby="act-b">
          <h2 id="act-b" className="text-sm font-bold text-slate-900">Block coverage</h2>
          {summary.perBlock.map((b) => {
            const pct = b.total ? Math.round((b.reported / b.total) * 100) : 0;
            return (
              <div key={b.block}>
                <div className="flex items-baseline justify-between text-sm">
                  <Link to={treesUrl({ block: b.block, stale: '1' })} className="font-semibold text-slate-900 hover:underline">
                    Block {b.block}
                  </Link>
                  <span className="tabular text-slate-600">
                    {b.reported} of {b.total} trees · <span className={pct < 25 ? 'text-rose-700 font-semibold' : 'font-semibold text-slate-900'}>{pct}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-1">
                  <div className={`h-full ${pct < 25 ? 'bg-rose-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          <p className="text-xs text-slate-500">Tap a block to see the trees nobody has reported on this week.</p>
        </section>
      </div>
    </div>
  );
};
