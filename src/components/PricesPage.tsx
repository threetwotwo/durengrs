import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { goBack, useQueryParams } from '../lib/router';
import {
  type Form,
  type MarketPrice,
  type StorePrice,
  type VarietyMarket,
  type WeeklySeries,
  KUPAS_BOX_KG,
  formOf,
  fruitGrid,
  isOlahan,
  latestPerVendor,
  marketByVariety,
  parseRupiah,
  priceWeeks,
  sortOlahan,
  weekLabel,
  weekStart,
  weeklySeries,
} from '../lib/market';
import { removeMarketPrice, setStorePrice, updateMarketPrice } from '../lib/marketData';
import { addDays, formatShortDate, todayStr } from '../lib/treatments';
import { PageHeader, inputCls } from './PageHeader';

/**
 * Other vendors' durian prices (#/harvest/prices?day=2026-11-02), sent to the WhatsApp bot as a screenshot or text
 * with the word HARGA and read by Gemini (bot/lib/prices.js). For one day: per variety the market's range and middle
 * per kg, how many sellers, a suggested price (the middle, rounded to Rp5.000) and the store's own price, typed here;
 * below, every price read, to correct (vendor, variety, grade, per kg) or delete, with the screenshot it came from.
 */

const rp = (n?: number) => (n === undefined ? '' : `Rp${Math.round(n).toLocaleString('id-ID')}`);
const DAYS_BACK = 60;

function useMarket() {
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [store, setStore] = useState<Map<string, StorePrice>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const since = addDays(todayStr(), -DAYS_BACK);
    const a = onSnapshot(
      query(collection(db, 'marketPrices'), where('date', '>=', since)),
      (s) => {
        setPrices(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MarketPrice, 'id'>) })));
        setLoading(false);
      },
      (e) => {
        console.error('Market prices failed to load:', e);
        setError(true);
        setLoading(false);
      }
    );
    const b = onSnapshot(
      collection(db, 'storePrices'),
      (s) => setStore(new Map(s.docs.map((d) => [d.id, { utuh: Number(d.data().pricePerKg) || undefined, kupas: Number(d.data().kupasPerKg) || undefined }]))),
      (e) => console.error('Store prices failed to load:', e)
    );
    return () => {
      a();
      b();
    };
  }, []);
  return { prices, store, loading, error };
}

export const PricesPage: React.FC = () => {
  const { t, locale } = useT();
  const { variants, workerLabel } = useFarm();
  const [params, setParams] = useQueryParams();
  const { prices, store, loading, error } = useMarket();
  const [msg, setMsg] = useState<string | null>(null);
  const names = useMemo(() => {
    const m = new Map(variants.map((v) => [v.code, v.name]));
    return (code: string) => m.get(code) || code;
  }, [variants]);
  // Weekly: a week's prices, each vendor's latest per product (a vendor posting daily counts once).
  const weeks = useMemo(() => priceWeeks(prices), [prices]);
  const asked = params.get('week') || '';
  const week = weeks.some((w) => w.week === asked) ? asked : weeks[0]?.week || '';
  const ofDay = useMemo(
    () => latestPerVendor(prices.filter((p) => weekStart(p.date) === week)).sort((a, b) => (a.vendor || '').localeCompare(b.vendor || '')),
    [prices, week]
  );
  const [chartForm, setChartForm] = useState<Form>('utuh');
  const order = useMemo(() => variants.map((v) => v.code), [variants]);
  const chart = useMemo(() => weeklySeries(prices, chartForm, order, names), [prices, chartForm, order, names]);
  const fruits = useMemo(() => ofDay.filter((p) => !isOlahan(p)), [ofDay]);
  const olahan = useMemo(() => sortOlahan(ofDay.filter(isOlahan)), [ofDay]);
  const grid = useMemo(() => fruitGrid(marketByVariety(fruits, names, store)), [fruits, names, store]);
  const fail = (e: any) => {
    console.error('Price save failed:', e);
    setMsg(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
  };

  const th = 'px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
  const td = 'px-2.5 py-2 border-t border-slate-100 whitespace-nowrap';

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => goBack('/harvest')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 min-h-9">
        <ArrowLeft className="w-4 h-4" />
        {t('hp.title')}
      </button>
      <PageHeader title={t('mp.title')} description={t('mp.desc')} />

      {msg && (
        <p role="alert" className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
          {msg}
        </p>
      )}

      {loading ? (
        <div className="h-40 rounded-xl bg-white border border-slate-200 animate-pulse" />
      ) : error ? (
        <p className="p-6 text-center text-sm text-rose-800 bg-rose-50 rounded-xl border border-rose-200">{t('mp.loadError')}</p>
      ) : !weeks.length ? (
        <div className="p-6 bg-white rounded-xl border border-slate-200 text-sm text-slate-700 space-y-2">
          <p className="font-semibold text-slate-900">{t('mp.none')}</p>
          <p className="whitespace-pre-line">{t('mp.howto')}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select value={week} onChange={(e) => setParams({ week: e.target.value }, { replace: true })} aria-label={t('mp.week')} className={`${inputCls} !w-auto`}>
              {weeks.map((w) => (
                <option key={w.week} value={w.week}>
                  {weekLabel(w.week, locale)} ({formatShortDate(w.week)}–{formatShortDate(addDays(w.week, 6))}) · {t('mp.nPrices', { n: w.n })}
                </option>
              ))}
            </select>
          </div>

          <WeeklyChart chart={chart} form={chartForm} onForm={setChartForm} />

          {/* A · Buah: each variety with its whole fruit and kupas prices side by side. */}
          <section aria-label={t('mp.fruit')} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <h2 className="px-3 pt-3 pb-1 text-sm font-bold text-slate-900">A · {t('mp.fruit')}</h2>
            {grid.length === 0 ? (
              <p className="px-3 pb-3 text-sm text-slate-500">{t('mp.noFruit')}</p>
            ) : (
              <>
              {/* On a phone: a compact table, the variety then whole and kupas, each with the market and our price. */}
              <table className="sm:hidden w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={`${th} text-left`}>{t('fr.variant')}</th>
                    <th scope="col" className={`${th} text-left text-emerald-800`}>{t('mp.form.utuh')} /kg</th>
                    <th scope="col" className={`${th} text-left text-amber-800`}>{t('mp.form.kupas')} /400g</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {grid.map((g) => (
                    <tr key={g.key} className="align-top">
                      <th scope="row" className="px-2.5 py-2 border-t border-slate-100 text-left font-semibold text-slate-900 text-[13px] leading-tight">
                        {g.name}
                        <span className="block mt-0.5 text-[11px] font-normal text-slate-500">
                          {g.sellers ? t(g.sellers === 1 ? 'mp.sellers1' : 'mp.sellersN', { n: g.sellers }) : ''}
                          {!g.matched && <span className="block text-amber-700">{t('mp.unmatched')}</span>}
                        </span>
                      </th>
                      {(['utuh', 'kupas'] as const).map((f) => (
                        <td key={f} className={`px-2 py-2 border-t border-slate-100 ${f === 'kupas' ? 'bg-amber-50/40' : ''}`}>
                          <MiniCell r={g[f]} form={f} onError={fail} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="hidden sm:table w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" rowSpan={2} className={`${th} text-left align-bottom sticky left-0 bg-white`}>{t('fr.variant')}</th>
                    <th scope="colgroup" colSpan={3} className={`${th} text-center border-l border-slate-200 text-emerald-800`}>{t('mp.form.utuh')} /kg</th>
                    <th scope="colgroup" colSpan={3} className={`${th} text-center border-l border-slate-200 text-amber-800`}>{t('mp.form.kupas')} /400g</th>
                  </tr>
                  <tr>
                    {(['utuh', 'kupas'] as const).map((f) => (
                      <React.Fragment key={f}>
                        <th scope="col" className={`${th} text-right border-l border-slate-200`}>{t('mp.market')}</th>
                        <th scope="col" className={`${th} text-right`} title={t('mp.suggested.title')}>{t('mp.suggested')}</th>
                        <th scope="col" className={`${th} text-left`}>{t('mp.oursShort')}</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular">
                  {grid.map((g) => (
                    <tr key={g.key}>
                      <th scope="row" className={`${td} text-left font-semibold text-slate-900 sticky left-0 bg-white`}>
                        {g.name}
                        <span className="block text-[11px] font-normal text-slate-500">
                          {g.sellers ? t(g.sellers === 1 ? 'mp.sellers1' : 'mp.sellersN', { n: g.sellers }) : ''}
                          {!g.matched && <span className="ml-1 text-amber-700" title={t('mp.unmatched.title')}>{t('mp.unmatched')}</span>}
                        </span>
                      </th>
                      {(['utuh', 'kupas'] as const).map((f) => (
                        <FormCells key={f} r={g[f]} form={f} onError={fail} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
            <p className="px-3 py-2 text-xs text-slate-500 border-t border-slate-100">{t('mp.perKgNote')}</p>
          </section>

          {/* B · Olahan: processed products, by type, size and price. */}
          {olahan.length > 0 && (
            <section aria-label={t('mp.olahan')} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
              <h2 className="px-3 pt-3 pb-1 text-sm font-bold text-slate-900">B · {t('mp.olahan')}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={`${th} text-left`}>{t('mp.type')}</th>
                    <th scope="col" className={`${th} text-left`}>{t('mp.size')}</th>
                    <th scope="col" className={`${th} text-right`}>{t('mp.price')}</th>
                    <th scope="col" className={`${th} text-left`}>{t('mp.vendor')}</th>
                    <th scope="col" className={`${th} text-left`}><span className="sr-only">{t('mp.source')}</span></th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {olahan.map((p) => (
                    <tr key={p.id}>
                      <td className={`${td} font-semibold text-slate-900 whitespace-normal min-w-[12rem]`}>{p.product || p.variety || '—'}</td>
                      <td className={`${td} text-slate-700`}>{p.size || ''}</td>
                      <td className={`${td} text-right font-semibold`}>
                        <span className={p.available === false ? 'line-through decoration-rose-400' : ''}>{rp(p.price)}</span>
                        {p.available === false && <span className="ml-1" title={t('mp.soldOut')}>❌</span>}
                      </td>
                      <td className={`${td} text-slate-700`}>{p.vendor || ''}</td>
                      <td className={`${td} py-1`}>
                        <RowActions p={p} who={p.workerPhone ? workerLabel(p.workerPhone) : p.vendorPhone ? `+${p.vendorPhone}` : ''} onError={fail} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <details className="bg-white rounded-xl border border-slate-200 shadow-xs">
            <summary className="px-3 py-3 text-sm font-semibold text-slate-800 cursor-pointer">
              {t('mp.all')} · {fruits.length}
            </summary>
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={`${th} text-left`}>{t('mp.vendor')}</th>
                    <th scope="col" className={`${th} text-left`}>{t('fr.variant')}</th>
                    <th scope="col" className={`${th} text-left`}>{t('mp.form')}</th>
                    <th scope="col" className={`${th} text-left`}>{t('mp.grade')}</th>
                    <th scope="col" className={`${th} text-right`}>{t('mp.price')}</th>
                    <th scope="col" className={`${th} text-left`}>{t('mp.perKg')}</th>
                    <th scope="col" className={`${th} text-left`}><span className="sr-only">{t('mp.source')}</span></th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {fruits.map((p) => (
                    <PriceRow key={p.id} p={p} variants={variants} onError={fail} who={p.workerPhone ? workerLabel(p.workerPhone) : p.vendorPhone ? `+${p.vendorPhone}` : ''} />
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="text-xs text-slate-500 whitespace-pre-line">{t('mp.howto')}</p>
        </>
      )}
    </div>
  );
};

/** Rupiah in short, for a phone: 165000 -> "165rb", 1200000 -> "1,2jt". */
const rpShort = (n?: number) =>
  n === undefined ? '' : n >= 1e6 ? `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })}jt` : `${Math.round(n / 1000).toLocaleString('id-ID')}rb`;

// Categorical colours in fixed order (checked for colour-blind readers); each line is also labelled at its end.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];

/**
 * The market's weekly middle price per kg of the farm's own varieties (local, fresh), one line each, whole fruit or
 * kupas: the whiteboard's MK / BT / BW chart. A week tapped or hovered shows its prices.
 */
const WeeklyChart: React.FC<{ chart: { weeks: string[]; series: WeeklySeries[] }; form: Form; onForm: (f: Form) => void }> = ({ chart, form, onForm }) => {
  const { t, locale } = useT();
  const [hover, setHover] = useState<number | null>(null);
  const { weeks, series } = chart;
  const W = 640;
  const H = 220;
  const pad = { l: 44, r: 92, t: 12, b: 28 };
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== undefined));
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const step = 50000;
  const yMin = Math.max(0, Math.floor((lo * 0.95) / step) * step);
  const yMax = Math.ceil((hi * 1.05) / step) * step || step;
  const x = (i: number) => (weeks.length < 2 ? pad.l + (W - pad.l - pad.r) / 2 : pad.l + (i * (W - pad.l - pad.r)) / (weeks.length - 1));
  const y = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b);
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const label = (code: string) => (series.find((s) => s.code === code)?.name || code);
  return (
    <section aria-label={t('mp.chart')} className="bg-white rounded-xl border border-slate-200 shadow-xs p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">{t('mp.chart')}</h2>
        <div role="radiogroup" aria-label={t('mp.form')} className="inline-grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
          {(['utuh', 'kupas'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={form === f}
              onClick={() => onForm(f)}
              className={`min-h-8 px-3 rounded-md text-xs font-semibold ${form === f ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
            >
              {t(`mp.form.${f}`)}
            </button>
          ))}
        </div>
      </div>
      {!series.length ? (
        <p className="text-sm text-slate-500">{t('mp.chart.none')}</p>
      ) : (
        <>
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${t('mp.chart')}: ${series.map((s) => s.name).join(', ')}`}>
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
                  <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#64748b">
                    {rpShort(v)}
                  </text>
                </g>
              ))}
              {weeks.map((w, i) => (
                <text key={w} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#64748b">
                  {weekLabel(w, locale)}
                </text>
              ))}
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />}
              {series.map((s, si) => {
                const pts = s.values.map((v, i) => (v === undefined ? null : ([x(i), y(v)] as const)));
                // Lines join the weeks that have a price; a week with none leaves a gap.
                const segs: string[] = [];
                let cur = '';
                pts.forEach((p) => {
                  if (!p) {
                    if (cur) segs.push(cur);
                    cur = '';
                  } else cur += `${cur ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
                });
                if (cur) segs.push(cur);
                const lastI = s.values.map((v, i) => (v === undefined ? -1 : i)).filter((i) => i >= 0).pop();
                const color = SERIES[si % SERIES.length];
                return (
                  <g key={s.code}>
                    {segs.map((d, k) => (
                      <path key={k} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    ))}
                    {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 5 : 3.5} fill={color} stroke="#fff" strokeWidth={2} />)}
                    {lastI !== undefined && (
                      <text x={x(lastI) + 8} y={y(s.values[lastI]!) + 4} fontSize={12} fontWeight={600} fill="#0f172a">
                        {s.code}
                      </text>
                    )}
                  </g>
                );
              })}
              {weeks.map((w, i) => (
                <rect
                  key={w}
                  x={x(i) - (W - pad.l - pad.r) / Math.max(2, weeks.length * 2)}
                  y={0}
                  width={(W - pad.l - pad.r) / Math.max(1, weeks.length)}
                  height={H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setHover(hover === i ? null : i)}
                />
              ))}
            </svg>
            {hover !== null && (
              <div className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 rounded-lg border border-slate-200 bg-white/95 shadow-sm px-2.5 py-1.5 text-xs">
                <p className="font-semibold text-slate-900">{weekLabel(weeks[hover], locale)}</p>
                {series.map((s, si) =>
                  s.values[hover] !== undefined ? (
                    <p key={s.code} className="flex items-center gap-1.5 tabular text-slate-700">
                      <span className="w-2 h-2 rounded-full" style={{ background: SERIES[si % SERIES.length] }} aria-hidden />
                      {label(s.code)} <strong className="text-slate-900">{rp(s.values[hover])}</strong>
                    </p>
                  ) : null
                )}
              </div>
            )}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
            {series.map((s, si) => (
              <li key={s.code} className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded" style={{ background: SERIES[si % SERIES.length] }} aria-hidden />
                {s.name} ({s.code})
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500">{t('mp.chart.note')}</p>
        </>
      )}
    </section>
  );
};

/** One form in the phone table: the market in short (165rb–180rb), the suggestion, our price typed below. */
const MiniCell: React.FC<{ r?: VarietyMarket; form: Form; onError: (e: unknown) => void }> = ({ r, form, onError }) => {
  const { t } = useT();
  if (!r) return <span className="text-slate-300">—</span>;
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="font-bold text-slate-900 leading-tight whitespace-nowrap">
        {r.low !== undefined
          ? r.low === r.high
            ? rpShort(r.low)
            : `${rpShort(r.low)}–${rpShort(r.high)}`
          : r.perFruit.length
            ? `${rpShort(Math.min(...r.perFruit))}/${t('mp.perFruit')}`
            : r.perPack.length
              ? `${rpShort(Math.min(...r.perPack))}/${t('mp.perPack')}`
              : '—'}
      </p>
      {r.suggested !== undefined && (
        <p className="text-[11px] text-slate-600 whitespace-nowrap">
          {t('mp.suggested')} <strong className="text-emerald-800">{rpShort(r.suggested)}</strong>
        </p>
      )}
      {r.code && <StorePriceInput code={r.code} form={form} value={r.store} median={r.median} onError={onError} compact />}
    </div>
  );
};

/** One form's three cells in the Buah grid: the market (range, middle below), the suggestion, our price. */
const FormCells: React.FC<{ r?: VarietyMarket; form: Form; onError: (e: unknown) => void }> = ({ r, form, onError }) => {
  const { t } = useT();
  const td = `px-2.5 py-2 border-t border-slate-100 whitespace-nowrap ${form === 'kupas' ? 'bg-amber-50/40' : ''}`;
  if (!r) return (
    <>
      <td className={`${td} border-l border-slate-200 text-right text-slate-300`}>—</td>
      <td className={td} />
      <td className={td} />
    </>
  );
  return (
    <>
      <td className={`${td} border-l border-slate-200 text-right`}>
        {r.low !== undefined ? (r.low === r.high ? rp(r.low) : `${rp(r.low)}–${rp(r.high)}`) : ''}
        {r.median !== undefined && r.low !== r.high && <span className="block text-[11px] text-slate-500">{t('mp.median')} {rp(r.median)}</span>}
        {r.perFruit.length > 0 && (
          <span className="block text-[11px] text-slate-500">
            {Math.min(...r.perFruit) === Math.max(...r.perFruit) ? rp(r.perFruit[0]) : `${rp(Math.min(...r.perFruit))}–${rp(Math.max(...r.perFruit))}`}/{t('mp.perFruit')}
          </span>
        )}
        {r.perPack.length > 0 && (
          <span className="block text-[11px] text-slate-500" title={t('mp.perPack.title')}>
            {Math.min(...r.perPack) === Math.max(...r.perPack) ? rp(r.perPack[0]) : `${rp(Math.min(...r.perPack))}–${rp(Math.max(...r.perPack))}`}/{t('mp.perPack')}
          </span>
        )}
      </td>
      <td className={`${td} text-right font-semibold text-emerald-800`}>{rp(r.suggested)}</td>
      <td className={`${td} py-1`}>{r.code ? <StorePriceInput code={r.code} form={form} value={r.store} median={r.median} onError={onError} /> : <span className="text-slate-300">—</span>}</td>
    </>
  );
};

/** The screenshot a price came from, and deleting it. */
const RowActions: React.FC<{ p: MarketPrice; who: string; onError: (e: unknown) => void }> = ({ p, who, onError }) => {
  const { t } = useT();
  return (
    <span className="flex items-center gap-0.5">
      {p.photo?.url && (
        <a href={p.photo.url} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title={who ? `${t('mp.source')} · ${who}` : t('mp.source')}>
          <ImageIcon className="w-4 h-4" />
        </a>
      )}
      <button
        type="button"
        onClick={() => window.confirm(t('mp.remove.confirm')) && removeMarketPrice(p.id).catch(onError)}
        className="p-2 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50"
        aria-label={t('mp.remove')}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </span>
  );
};


/** The store's own price per kg, typed in place ("150000", "150rb"), saved when leaving the box; how far off the market. */
const StorePriceInput: React.FC<{ code: string; form: Form; value?: number; median?: number; onError: (e: unknown) => void; compact?: boolean }> = ({
  code,
  form,
  value,
  median,
  onError,
  compact,
}) => {
  const { t } = useT();
  const [text, setText] = useState(value ? String(value) : '');
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(value ? String(value) : ''), [value]);
  const commit = () => {
    const n = text.trim() ? parseRupiah(text) : null;
    if (text.trim() && (n === null || n < 1000)) return setBad(true);
    setBad(false);
    if ((n ?? undefined) === value) return;
    setBusy(true);
    // Typed per 400 g box for kupas, kept per kg.
    setStorePrice(code, form, n === null ? null : form === 'kupas' ? Math.round(n / KUPAS_BOX_KG) : n)
      .catch(onError)
      .finally(() => setBusy(false));
  };
  const diff = value && median ? Math.round(((value - median) / median) * 100) : null;
  return (
    <span className="flex items-center gap-2">
      <span className={compact ? 'relative flex-1 min-w-0' : 'relative'}>
        <input
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder={compact ? t('mp.oursPh') : form === 'kupas' ? 'Rp/400g' : 'Rp/kg'}
          aria-label={t('mp.ours')}
          aria-invalid={bad || undefined}
          className={`${compact ? 'w-full h-8 bg-white' : 'w-28 h-9'} px-2 rounded-lg border text-right text-sm tabular ${bad ? 'border-rose-400' : 'border-slate-300'}`}
        />
        {busy && <Loader2 className="absolute -left-4 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 animate-spin" aria-hidden />}
      </span>
      {diff !== null && (
        <span
          className={`text-xs font-semibold ${Math.abs(diff) <= 5 ? 'text-slate-500' : diff > 0 ? 'text-amber-700' : 'text-sky-700'}`}
          title={t('mp.diff.title')}
        >
          {diff > 0 ? '+' : ''}
          {diff}%
        </span>
      )}
    </span>
  );
};

/** One price read: vendor, variety, grade and per kg can be corrected in place; the screenshot opens; it can go. */
const PriceRow: React.FC<{ p: MarketPrice; variants: Array<{ code: string; name: string }>; who: string; onError: (e: unknown) => void }> = ({ p, variants, who, onError }) => {
  const { t } = useT();
  const [vendor, setVendor] = useState(p.vendor || '');
  const [grade, setGrade] = useState(p.grade || '');
  const [perKg, setPerKg] = useState(p.pricePerKg ? String(p.pricePerKg) : '');
  useEffect(() => setVendor(p.vendor || ''), [p.vendor]);
  useEffect(() => setGrade(p.grade || ''), [p.grade]);
  useEffect(() => setPerKg(p.pricePerKg ? String(p.pricePerKg) : ''), [p.pricePerKg]);
  const save = (patch: Parameters<typeof updateMarketPrice>[1]) => updateMarketPrice(p.id, patch).catch(onError);
  const cell = 'px-1.5 py-1 border-t border-slate-100';
  const box = 'h-9 px-2 rounded-md border border-transparent hover:border-slate-200 focus:border-emerald-600 focus:outline-none bg-transparent text-sm';
  return (
    <tr>
      <td className={cell}>
        <input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          onBlur={() => vendor.trim() !== (p.vendor || '') && save({ vendor: vendor.trim().slice(0, 60) })}
          placeholder="—"
          aria-label={t('mp.vendor')}
          className={`${box} w-36`}
        />
      </td>
      <td className={cell}>
        <select
          value={p.varietyCode || ''}
          onChange={(e) => save({ varietyCode: e.target.value })}
          aria-label={t('fr.variant')}
          className={`${box} w-36`}
          title={p.variety}
        >
          <option value="">{p.variety ? `${p.variety} (?)` : '—'}</option>
          {variants.map((v) => (
            <option key={v.code} value={v.code}>
              {v.name || v.code}
            </option>
          ))}
        </select>
      </td>
      <td className={cell}>
        <select value={formOf(p)} onChange={(e) => save({ form: e.target.value as Form })} aria-label={t('mp.form')} className={`${box} w-24`}>
          <option value="utuh">{t('mp.form.utuh')}</option>
          <option value="kupas">{t('mp.form.kupas')}</option>
        </select>
      </td>
      <td className={cell}>
        <input
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          onBlur={() => grade.trim() !== (p.grade || '') && save({ grade: grade.trim().slice(0, 30) })}
          placeholder="—"
          aria-label={t('mp.grade')}
          className={`${box} w-20`}
        />
      </td>
      <td className={`${cell} text-right whitespace-nowrap text-slate-700`} title={p.note}>
        <span className={p.available === false ? 'line-through decoration-rose-400' : ''}>
          {rp(p.price)}/{p.unit === 'kg' ? 'kg' : p.unit === 'buah' ? t('mp.perFruit') : p.unit === 'pack' ? 'box' : '…'}
        </span>
        {p.available === false && <span className="ml-1" title={t('mp.soldOut')}>❌</span>}
        {(p.fruitKg || p.origin || p.condition) && (
          <span className="block text-xs text-slate-500">
            {[p.origin, p.condition ? t(`mp.cond.${p.condition}`) : '', p.fruitKg ? `${p.unit === 'pack' ? '' : '±'}${Math.round(p.fruitKg * 1000)} g` : ''].filter(Boolean).join(' · ')}
          </span>
        )}
      </td>
      <td className={cell}>
        <input
          inputMode="numeric"
          value={perKg}
          onChange={(e) => setPerKg(e.target.value)}
          onBlur={() => {
            const n = perKg.trim() ? parseRupiah(perKg) : null;
            if (perKg.trim() && n === null) return setPerKg(p.pricePerKg ? String(p.pricePerKg) : '');
            if ((n ?? undefined) !== p.pricePerKg) save({ pricePerKg: n ?? undefined });
          }}
          placeholder="—"
          aria-label={t('mp.perKg')}
          className={`${box} w-28 text-right font-semibold tabular`}
        />
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        <span className="flex items-center gap-0.5">
          {p.photo?.url && (
            <a href={p.photo.url} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title={who ? `${t('mp.source')} · ${who}` : t('mp.source')}>
              <ImageIcon className="w-4 h-4" />
            </a>
          )}
          <button
            type="button"
            onClick={() => window.confirm(t('mp.remove.confirm')) && removeMarketPrice(p.id).catch(onError)}
            className="p-2 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50"
            aria-label={t('mp.remove')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </span>
      </td>
    </tr>
  );
};
