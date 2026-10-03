import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { buildHarvestRows, fruitsByMonth, saveHarvestCycle } from '../lib/insights';
import { formatShortDate, todayStr } from '../lib/treatments';
import { useT } from '../i18n';
import { Link } from './Link';
import { inputCls } from './PageHeader';

/** When will each block ripen, and roughly how much fruit to expect each month. */
export const HarvestView: React.FC = () => {
  const { t, locale } = useT();
  const { trees, variants, harvestCycles, blocks, scheduleError } = useFarm();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => buildHarvestRows(trees, variants, harvestCycles), [trees, variants, harvestCycles]);
  const months = useMemo(() => fruitsByMonth(rows), [rows, locale]);
  const maxFruits = Math.max(1, ...months.map((m) => m.fruits));
  const cycleByBlock = new Map(harvestCycles.map((c) => [c.block, c.floweredOn]));
  const missingRipening = Array.from(new Set(rows.filter((r) => !r.ripeningDays).map((r) => r.variantName)));

  const setDate = async (block: string, value: string) => {
    setSaving(block);
    setError(null);
    try {
      await saveHarvestCycle(block, value || null);
    } catch (e: any) {
      setError(t('sched.hv.saveError'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      {(scheduleError || error) && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error || t('sched.hv.rulesHint')}</span>
        </div>
      )}

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3" aria-labelledby="hv-dates">
        <div>
          <h2 id="hv-dates" className="text-sm font-bold text-slate-900">{t('sched.hv.h1')}</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            {t('sched.hv.help')}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {blocks.map((b) => (
            <div key={b}>
              <label htmlFor={`fl-${b}`} className="block text-xs font-semibold text-slate-700 mb-1">{t('common.blockN', { n: b })}</label>
              <input
                id={`fl-${b}`}
                type="date"
                max={todayStr()}
                value={cycleByBlock.get(b) || ''}
                onChange={(e) => setDate(b, e.target.value)}
                disabled={saving === b}
                className={inputCls}
              />
            </div>
          ))}
        </div>
        {missingRipening.length > 0 && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            {t('sched.hv.missing', { names: missingRipening.join(', ') })}{' '}
            <Link to="/variants" className="font-semibold underline">{t('sched.hv.setVariants')}</Link>.
          </p>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3" aria-labelledby="hv-months">
        <h2 id="hv-months" className="text-sm font-bold text-slate-900">{t('sched.hv.h2')}</h2>
        {months.length === 0 ? (
          <p className="text-sm text-slate-600">{t('sched.hv.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {months.map((m) => (
              <li key={m.month} className="grid grid-cols-[72px_1fr_auto] items-center gap-3 text-sm">
                <span className="text-slate-700 font-medium">{m.label}</span>
                <span className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <span className="block h-full bg-emerald-500" style={{ width: `${(m.fruits / maxFruits) * 100}%` }} />
                </span>
                <span className="tabular text-slate-900 font-semibold">
                  {m.fruits} <span className="text-xs text-slate-500 font-normal">{t('sched.hv.fruitsTrees', { n: m.trees })}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">{t('sched.hv.guide')}</p>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden" aria-labelledby="hv-rows">
        <h2 id="hv-rows" className="px-4 py-3 text-sm font-bold text-slate-900 border-b border-slate-200">{t('sched.hv.h3')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase tracking-wide text-slate-600 bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{t('common.block')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('common.variant')}</th>
                <th className="px-3 py-2.5 font-semibold text-right">{t('common.trees')}</th>
                <th className="px-3 py-2.5 font-semibold text-right">{t('sched.hv.estFruits')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('sched.hv.flowered')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('sched.hv.expected')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.block}|${r.variant}`}>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{t('common.blockN', { n: r.block })}</td>
                  <td className="px-3 py-2.5 text-slate-700">{r.variantName}</td>
                  <td className="px-3 py-2.5 text-right tabular">{r.trees}</td>
                  <td className="px-3 py-2.5 text-right tabular font-semibold">{r.fruits}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.floweredOn ? formatShortDate(r.floweredOn) : <span className="text-slate-400">{t('sched.hv.notSet')}</span>}</td>
                  <td className="px-3 py-2.5">
                    {r.harvestDate ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{formatShortDate(r.harvestDate)}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${
                            (r.daysToHarvest ?? 0) < 0
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : (r.daysToHarvest ?? 0) <= 14
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {(r.daysToHarvest ?? 0) < 0 ? t('sched.hv.ago', { n: -(r.daysToHarvest ?? 0) }) : t('sched.hv.in', { n: r.daysToHarvest ?? 0 })}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400">{!r.floweredOn ? t('sched.hv.needsFlower') : t('sched.hv.needsRipen')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
