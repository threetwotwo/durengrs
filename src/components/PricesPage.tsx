import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { goBack, useQueryParams } from '../lib/router';
import { type MarketPrice, marketByVariety, parseRupiah, priceDays } from '../lib/market';
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
  const [store, setStore] = useState<Map<string, number>>(new Map());
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
      (s) => setStore(new Map(s.docs.map((d) => [d.id, Number(d.data().pricePerKg) || 0]))),
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
  const { t } = useT();
  const { variants, workerLabel } = useFarm();
  const [params, setParams] = useQueryParams();
  const { prices, store, loading, error } = useMarket();
  const [msg, setMsg] = useState<string | null>(null);
  const names = useMemo(() => {
    const m = new Map(variants.map((v) => [v.code, v.name]));
    return (code: string) => m.get(code) || code;
  }, [variants]);
  const days = useMemo(() => priceDays(prices), [prices]);
  const asked = params.get('day') || '';
  const day = days.some((d) => d.date === asked) ? asked : days[0]?.date || '';
  const ofDay = useMemo(() => prices.filter((p) => p.date === day).sort((a, b) => (a.vendor || '').localeCompare(b.vendor || '')), [prices, day]);
  const rows = useMemo(() => marketByVariety(ofDay, names, store), [ofDay, names, store]);
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
      ) : !days.length ? (
        <div className="p-6 bg-white rounded-xl border border-slate-200 text-sm text-slate-700 space-y-2">
          <p className="font-semibold text-slate-900">{t('mp.none')}</p>
          <p className="whitespace-pre-line">{t('mp.howto')}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select value={day} onChange={(e) => setParams({ day: e.target.value }, { replace: true })} aria-label={t('mp.day')} className={`${inputCls} !w-auto`}>
              {days.map((d) => (
                <option key={d.date} value={d.date}>
                  {d.date === todayStr() ? t('fr.today') : d.date === addDays(todayStr(), -1) ? t('fr.yesterday') : formatShortDate(d.date)} · {t('mp.nPrices', { n: d.n })}
                </option>
              ))}
            </select>
          </div>

          <section aria-label={t('mp.perVariety')} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="text-left px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('mp.perVariety')}</caption>
              <thead>
                <tr>
                  <th scope="col" className={`${th} text-left`}>{t('fr.variant')}</th>
                  <th scope="col" className={`${th} text-right`}>{t('mp.range')}</th>
                  <th scope="col" className={`${th} text-right`}>{t('mp.median')}</th>
                  <th scope="col" className={`${th} text-right`}>{t('mp.sellers')}</th>
                  <th scope="col" className={`${th} text-right`} title={t('mp.suggested.title')}>{t('mp.suggested')}</th>
                  <th scope="col" className={`${th} text-left`}>{t('mp.ours')}</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row" className={`${td} text-left font-semibold text-slate-900`}>
                      {r.name}
                      {!r.code && <span className="ml-1.5 text-[11px] font-normal text-amber-700" title={t('mp.unmatched.title')}>{t('mp.unmatched')}</span>}
                    </th>
                    <td className={`${td} text-right`}>
                      {r.low !== undefined ? (r.low === r.high ? rp(r.low) : `${rp(r.low)}–${rp(r.high)}`) : ''}
                      {r.perFruit.length > 0 && (
                        <span className="block text-xs text-slate-500">
                          {Math.min(...r.perFruit) === Math.max(...r.perFruit) ? rp(r.perFruit[0]) : `${rp(Math.min(...r.perFruit))}–${rp(Math.max(...r.perFruit))}`}/{t('mp.perFruit')}
                        </span>
                      )}
                    </td>
                    <td className={`${td} text-right font-semibold`}>{rp(r.median)}</td>
                    <td className={`${td} text-right`}>{r.sellers || ''}</td>
                    <td className={`${td} text-right font-semibold text-emerald-800`}>{rp(r.suggested)}</td>
                    <td className={`${td} py-1`}>
                      {r.code ? <StorePriceInput code={r.code} value={r.store} median={r.median} onError={fail} /> : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-slate-500 border-t border-slate-100">{t('mp.perKgNote')}</p>
          </section>

          <section aria-label={t('mp.all')} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="text-left px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('mp.all')} · {ofDay.length}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={`${th} text-left`}>{t('mp.vendor')}</th>
                  <th scope="col" className={`${th} text-left`}>{t('fr.variant')}</th>
                  <th scope="col" className={`${th} text-left`}>{t('mp.grade')}</th>
                  <th scope="col" className={`${th} text-right`}>{t('mp.price')}</th>
                  <th scope="col" className={`${th} text-left`}>{t('mp.perKg')}</th>
                  <th scope="col" className={`${th} text-left`}><span className="sr-only">{t('mp.source')}</span></th>
                </tr>
              </thead>
              <tbody className="tabular">
                {ofDay.map((p) => (
                  <PriceRow key={p.id} p={p} variants={variants} onError={fail} who={p.workerPhone ? workerLabel(p.workerPhone) : ''} />
                ))}
              </tbody>
            </table>
          </section>
          <p className="text-xs text-slate-500 whitespace-pre-line">{t('mp.howto')}</p>
        </>
      )}
    </div>
  );
};

/** The store's own price per kg, typed in place ("150000", "150rb"), saved when leaving the box; how far off the market. */
const StorePriceInput: React.FC<{ code: string; value?: number; median?: number; onError: (e: unknown) => void }> = ({ code, value, median, onError }) => {
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
    setStorePrice(code, n)
      .catch(onError)
      .finally(() => setBusy(false));
  };
  const diff = value && median ? Math.round(((value - median) / median) * 100) : null;
  return (
    <span className="flex items-center gap-2">
      <span className="relative">
        <input
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder="Rp/kg"
          aria-label={t('mp.ours')}
          aria-invalid={bad || undefined}
          className={`w-28 h-9 px-2 rounded-lg border text-right text-sm tabular ${bad ? 'border-rose-400' : 'border-slate-300'}`}
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
        {rp(p.price)}/{p.unit === 'kg' ? 'kg' : p.unit === 'buah' ? t('mp.perFruit') : '…'}
        {p.fruitKg ? <span className="block text-xs text-slate-500">±{p.fruitKg} kg</span> : null}
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
