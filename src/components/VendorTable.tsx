import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Image as ImageIcon, Search } from 'lucide-react';
import { useT } from '../i18n';
import { type MarketPrice, type StorePrice, type VendorSortKey, sortVendorRows, vendorRows } from '../lib/market';
import { formatShortDate } from '../lib/treatments';

const rp = (n?: number) => (n === undefined ? '' : `Rp${Math.round(n).toLocaleString('id-ID')}`);

/**
 * The week's fruit prices as one table, a row per vendor's quote: vendor, variety, form, origin, grade, the price as
 * quoted, the same in a unit to compare (whole per kg, kupas per 400 g), how far from the market middle and from our
 * own price, the day, sold out, the screenshot. Sorted by any column (tap its header, again for the other way);
 * filtered by vendor or variety.
 */
export const VendorTable: React.FC<{ prices: MarketPrice[]; names: (code: string) => string; store: Map<string, StorePrice> }> = ({ prices, names, store }) => {
  const { t } = useT();
  const [sort, setSort] = useState<{ key: VendorSortKey; dir: 'asc' | 'desc' }>({ key: 'variety', dir: 'asc' });
  const [q, setQ] = useState('');
  const all = useMemo(() => vendorRows(prices, names, store, (c) => t(`mp.cond.${c}`)), [prices, names, store, t]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const shown = s ? all.filter((r) => `${r.vendor} ${r.variety} ${r.p.variety || ''} ${r.origin}`.toLowerCase().includes(s)) : all;
    return sortVendorRows(shown, sort.key, sort.dir);
  }, [all, q, sort]);
  const vendors = new Set(all.map((r) => r.vendor.toLowerCase()).filter(Boolean)).size;
  // Numbers start high-to-low when first tapped (the dearest first), words A-Z.
  const by = (key: VendorSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: ['price', 'compare', 'vsMarket', 'vsStore', 'date'].includes(key) ? 'desc' : 'asc' }));

  const th = 'px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
  const td = 'px-2.5 py-2 border-t border-slate-100 whitespace-nowrap';
  const Head: React.FC<{ k: VendorSortKey; right?: boolean; sticky?: boolean; title?: string; children: React.ReactNode }> = ({ k, right, sticky, title, children }) => {
    const on = sort.key === k;
    const Icon = !on ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`${th} ${right ? 'text-right' : 'text-left'} ${sticky ? 'sticky left-0 z-10 bg-slate-50' : ''}`} title={title}>
        <button type="button" onClick={() => by(k)} className={`inline-flex items-center gap-1 uppercase hover:text-slate-900 ${on ? 'text-slate-900' : ''} ${right ? 'flex-row-reverse' : ''}`}>
          {children}
          <Icon className={`w-3 h-3 ${on ? '' : 'opacity-40'}`} aria-hidden="true" />
        </button>
      </th>
    );
  };
  const off = (v?: number) =>
    v === undefined ? (
      <span className="text-slate-300">—</span>
    ) : (
      <span className={v > 0 ? 'text-rose-700' : v < 0 ? 'text-emerald-700' : 'text-slate-600'}>
        {v > 0 ? '+' : ''}
        {v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
      </span>
    );

  return (
    <section aria-label={t('mp.vendors')} className="bg-white rounded-xl border border-slate-200 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3 pb-2">
        <h2 className="text-sm font-bold text-slate-900">
          {t('mp.vendors')} <span className="font-normal text-slate-500">· {t('mp.vendors.count', { v: vendors, n: all.length })}</span>
        </h2>
        <label className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('mp.vendors.filter')} aria-label={t('mp.vendors.filter')} className="h-9 w-56 max-w-full pl-8 pr-2 rounded-lg border border-slate-200 text-sm focus:border-emerald-600 focus:outline-none" />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <Head k="vendor" sticky>{t('mp.vendor')}</Head>
              <Head k="variety">{t('fr.variant')}</Head>
              <Head k="form">{t('mp.form')}</Head>
              <Head k="origin">{t('mp.origin')}</Head>
              <Head k="grade">{t('mp.grade')}</Head>
              <Head k="price" right>{t('mp.quoted')}</Head>
              <Head k="compare" right title={t('mp.compare.title')}>{t('mp.compare')}</Head>
              <Head k="vsMarket" right title={t('mp.vsMarket.title')}>{t('mp.vsMarket')}</Head>
              <Head k="vsStore" right title={t('mp.vsStore.title')}>{t('mp.vsStore')}</Head>
              <Head k="date">{t('mp.date')}</Head>
              <th scope="col" className={th}><span className="sr-only">{t('mp.source')}</span></th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r) => {
              const p = r.p;
              const sold = p.available === false;
              return (
                <tr key={p.id} className="group hover:bg-slate-50">
                  <td className={`${td} sticky left-0 bg-white group-hover:bg-slate-50 font-semibold text-slate-900 max-w-[11rem] truncate`} title={r.vendor}>
                    {r.vendor || <span className="text-slate-400 font-normal">—</span>}
                  </td>
                  <td className={`${td} text-slate-800`} title={p.variety}>
                    {r.variety}
                    {!p.varietyCode && <span className="ml-1 text-xs text-amber-700">?</span>}
                  </td>
                  <td className={td}>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${r.form === 'kupas' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>{t(`mp.form.${r.form}`)}</span>
                  </td>
                  <td className={`${td} text-slate-600`}>{r.origin || <span className="text-slate-400">{t('mp.local')}</span>}</td>
                  <td className={`${td} text-slate-600`}>{p.grade || <span className="text-slate-300">—</span>}</td>
                  <td className={`${td} text-right text-slate-700`} title={p.note}>
                    <span className={sold ? 'line-through decoration-rose-400' : ''}>
                      {rp(p.price)}/{p.unit === 'kg' ? 'kg' : p.unit === 'buah' ? t('mp.perFruit') : p.unit === 'pack' ? 'box' : '…'}
                    </span>
                    {sold && <span className="ml-1" title={t('mp.soldOut')}>❌</span>}
                    {p.fruitKg ? <span className="block text-xs text-slate-500">{`${p.unit === 'pack' ? '' : '±'}${Math.round(p.fruitKg * 1000).toLocaleString('id-ID')} g`}</span> : null}
                  </td>
                  <td className={`${td} text-right font-semibold text-slate-900`}>
                    {r.compare !== undefined ? (
                      <>
                        {rp(r.compare)}
                        <span className="text-xs font-normal text-slate-500">{r.form === 'kupas' ? '/400g' : '/kg'}</span>
                      </>
                    ) : (
                      <span className="text-slate-300 font-normal">—</span>
                    )}
                  </td>
                  <td className={`${td} text-right`} title={r.median ? `${t('mp.market')} ${rp(r.median)}` : undefined}>{off(r.vsMarket)}</td>
                  <td className={`${td} text-right`} title={r.store ? `${t('mp.oursPrice')} ${rp(r.store)}` : undefined}>{off(r.vsStore)}</td>
                  <td className={`${td} text-slate-600`}>{formatShortDate(p.date)}</td>
                  <td className={`${td} py-0`}>
                    {p.photo?.url && (
                      <a href={p.photo.url} target="_blank" rel="noreferrer" className="inline-flex p-2 rounded-lg text-slate-500 hover:bg-slate-100" title={t('mp.source')}>
                        <ImageIcon className="w-4 h-4" />
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-sm text-slate-500">{t('mp.vendors.none')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-100">{t('mp.vendors.note')}</p>
    </section>
  );
};
