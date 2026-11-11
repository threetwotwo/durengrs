import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { type StockItem, type StockMove, type StockMoveType, byTime, stockBalances, stockLevel, stockQty, toItemUnit } from '../shared/stock';
import { formatShortDate, todayStr } from '../lib/treatments';
import { PageHeader, btnPrimary, btnSecondary, inputCls } from './PageHeader';

const LEVEL_TONE = { out: 'bg-rose-100 text-rose-800', low: 'bg-amber-100 text-amber-900', ok: 'bg-emerald-50 text-emerald-800' } as const;

/**
 * The warehouse's pupuk and obat (#/stock): every product with its balance (the last stock opname plus deliveries
 * minus what went out since; src/shared/stock.ts), what is out or low first in the summary, each product's history
 * (from WhatsApp: PAKAI, MASUK, OPNAME; or entered here), and a form for management to record or correct.
 */
export const StockPage: React.FC = () => {
  const { t, locale } = useT();
  const { workerLabel } = useFarm();
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const onErr = (e: Error) => {
      console.error('Stock:', e);
      setError(e.message);
    };
    const a = onSnapshot(collection(db, 'stockItems'), (s) => setItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as StockItem).sort((x, y) => (x.order || 0) - (y.order || 0))), onErr);
    const b = onSnapshot(collection(db, 'stockMoves'), (s) => setMoves(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as StockMove)), onErr);
    return () => {
      a();
      b();
    };
  }, []);
  const bal = useMemo(() => stockBalances(moves), [moves]);
  const lang = locale.startsWith('id') ? 'id' : 'en';
  const qty = (n: number, i: StockItem) => stockQty(n, i, lang);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items || []).filter((i) => !s || `${i.name} ${i.producer || ''} ${i.content || ''} ${i.kind || ''} ${i.method || ''}`.toLowerCase().includes(s));
  }, [items, q]);
  const levels = (items || []).map((i) => stockLevel(i, bal.get(i.id)?.balance ?? 0));
  const sections = [...new Set(rows.map((i) => i.section || ''))];
  const word: Record<StockMoveType, string> = { in: t('st.in'), out: t('st.out'), count: t('st.count') };

  const remove = async (m: StockMove) => {
    if (!window.confirm(t('st.remove.confirm'))) return;
    try {
      await deleteDoc(doc(db, 'stockMoves', m.id));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const th = 'px-2.5 h-10 text-left text-[11px] font-semibold text-slate-300 whitespace-nowrap';
  const td = 'px-2.5 py-2 border-b border-slate-100 align-top';
  return (
    <div className="space-y-4">
      <PageHeader
        title={t('st.title')}
        description={t('st.desc')}
        actions={
          <button type="button" onClick={() => setAdding((x) => !x)} className={btnPrimary}>
            <Plus className="w-4 h-4" />
            {t('st.add')}
          </button>
        }
      />
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {adding && items && <MoveForm items={items} balances={bal} onDone={() => setAdding(false)} />}
      {items && (
        <dl className="grid grid-cols-3 gap-2">
          {[
            [t('st.sum.items'), items.length, 'text-slate-900'],
            [t('st.sum.ok'), levels.filter((l) => l !== 'out').length, 'text-emerald-800'],
            [t('st.sum.out'), levels.filter((l) => l === 'out').length, 'text-rose-700'],
          ].map(([label, n, tone]) => (
            <div key={label as string} className="bg-white rounded-xl border border-slate-200 px-3 py-2.5">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className={`text-2xl font-bold tabular ${tone}`}>{n}</dd>
            </div>
          ))}
        </dl>
      )}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('st.search')} aria-label={t('st.search')} className={`${inputCls} max-w-sm`} />
      {items && !items.length && <p className="p-8 text-center text-sm text-slate-600 bg-white rounded-xl border border-slate-200">{t('st.none')}</p>}
      {rows.length > 0 && (
        // As the warehouse's inventory sheet: one row per product, by section; tap a row for its history.
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th scope="col" className={`${th} w-10 text-right`}>{t('st.col.no')}</th>
                <th scope="col" className={`${th} sticky left-0 z-10 bg-slate-900 min-w-[8rem] sm:min-w-[11rem]`}>{t('st.col.product')}</th>
                <th scope="col" className={`${th} text-right`}>{t('st.col.balance')}</th>
                <th scope="col" className={th}>{t('st.col.pack')}</th>
                <th scope="col" className={th}>{t('st.col.producer')}</th>
                <th scope="col" className={th}>{t('st.col.content')}</th>
                <th scope="col" className={th}>{t('st.col.kind')}</th>
                <th scope="col" className={th}>{t('st.col.method')}</th>
                <th scope="col" className={th}>{t('st.col.counted')}</th>
                <th scope="col" className={th}>{t('st.col.last')}</th>
              </tr>
            </thead>
            {sections.map((sec) => (
              <tbody key={sec}>
                {sec && (
                  <tr>
                    <td colSpan={10} className="p-0 bg-slate-100 border-b border-slate-200">
                      <span className="sticky left-0 inline-block px-2.5 py-1.5 text-xs font-bold text-slate-700">{sec}</span>
                    </td>
                  </tr>
                )}
                {rows
                  .filter((i) => (i.section || '') === sec)
                  .map((i) => {
                    const b = bal.get(i.id);
                    const balance = b?.balance ?? 0;
                    const lv = stockLevel(i, balance);
                    const isOpen = open === i.id;
                    const history = moves.filter((m) => m.itemId === i.id).sort(byTime).reverse();
                    const cell = `${td} whitespace-nowrap text-slate-600`;
                    return (
                      <React.Fragment key={i.id}>
                        <tr className="group hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(isOpen ? null : i.id)}>
                          <td className={`${td} text-right tabular text-slate-500`}>{i.no ?? ''}</td>
                          <td className={`${td} sticky left-0 z-[1] bg-white group-hover:bg-slate-50`}>
                            <button type="button" aria-expanded={isOpen} className="flex items-start gap-1 text-left">
                              {isOpen ? <ChevronDown className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />}
                              <span className="font-semibold text-slate-900">{i.name}</span>
                            </button>
                          </td>
                          <td className={`${td} text-right whitespace-nowrap`}>
                            <span className={`inline-block px-2 py-0.5 rounded-md font-semibold tabular ${LEVEL_TONE[lv]}`}>{qty(balance, { ...i, pack: undefined })}</span>
                            {i.pack && i.pack > 1 && balance > 0 && (
                              <span className="block mt-0.5 text-[11px] text-slate-500 tabular">{t('st.packs', { n: (Math.round((balance / i.pack) * 10) / 10).toLocaleString(locale) })}</span>
                            )}
                            {i.status === 'buy' && <span className="block mt-0.5 text-[10px] font-bold text-sky-800">{t('st.buy')}</span>}
                          </td>
                          <td className={`${cell} tabular`}>{i.pack ? `${i.pack.toLocaleString(locale)} ${i.unit}` : i.unit}</td>
                          <td className={cell}>{i.producer || '—'}</td>
                          <td className={`${td} text-xs text-slate-600 min-w-[12rem] max-w-[20rem]`}>{i.content || '—'}</td>
                          <td className={`${td} text-xs text-slate-600 min-w-[10rem] max-w-[16rem]`}>{i.kind || '—'}</td>
                          <td className={`${td} text-xs text-slate-600 min-w-[7rem] max-w-[12rem]`}>{i.method || '—'}</td>
                          <td className={`${cell} tabular`}>{b?.since ? `${formatShortDate(b.since)} · ${qty(b.counted ?? 0, i)}` : '—'}</td>
                          <td className={`${cell} tabular`}>{b?.last && b.last.source !== 'sheet' ? `${formatShortDate(b.last.date)} · ${word[b.last.type]} ${qty(b.last.qty, i)}` : '—'}</td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={10} className="p-0 bg-slate-50 border-b border-slate-200">
                              <div className="sticky left-0 max-w-[calc(100vw-2rem)] sm:max-w-2xl px-3 py-3">
                                {history.length ? (
                                  <ul className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200">
                                    {history.map((m) => (
                                      <li key={m.id} className="px-3 py-2 flex items-start gap-3 text-sm">
                                        <span className="w-14 shrink-0 tabular text-slate-600">{formatShortDate(m.date)}</span>
                                        <span className="flex-1 min-w-0">
                                          <strong className={m.type === 'in' ? 'text-emerald-800' : m.type === 'out' ? 'text-rose-800' : 'text-slate-900'}>
                                            {word[m.type]} {m.type === 'in' ? '+' : m.type === 'out' ? '−' : '='}
                                            {qty(m.qty, i)}
                                          </strong>
                                          {m.block && <span className="ml-1.5 text-slate-600">{t('st.block', { b: m.block })}</span>}
                                          <span className="block text-xs text-slate-500">
                                            {[m.workerPhone ? workerLabel(m.workerPhone) : m.source === 'sheet' ? t('st.fromSheet') : t('st.fromApp'), m.note].filter(Boolean).join(' · ')}
                                          </span>
                                        </span>
                                        <button type="button" onClick={(e) => (e.stopPropagation(), remove(m))} aria-label={t('st.remove')} className="p-1.5 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-slate-500">{t('st.noMoves')}</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
};

/**
 * Management records here (the warehouse reports on WhatsApp): what kind first, Incoming by default, then Stock
 * count, Outgoing last; the product; how much, in packs when it comes in packs; and before saving, what the balance
 * will be. The day (today) and a note fold away; the block only asks when something goes out.
 */
const MoveForm: React.FC<{ items: StockItem[]; balances: Map<string, { balance: number }>; onDone: () => void }> = ({ items, balances, onDone }) => {
  const { t, locale } = useT();
  const lang = locale.startsWith('id') ? 'id' : 'en';
  const [type, setType] = useState<StockMoveType>('in');
  const [itemId, setItemId] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [block, setBlock] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayStr());
  const [more, setMore] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const item = items.find((i) => i.id === itemId);
  // Packs first when the product comes in packs (a delivery is counted in sacks and bottles), then its own unit.
  const units = item
    ? [...(item.pack && item.pack > 1 ? ['pack'] : []), item.unit, ...(item.unit === 'kg' ? ['gr'] : item.unit === 'gr' ? ['kg'] : item.unit === 'ltr' ? ['ml'] : ['ltr'])]
    : [];
  const u = unit || units[0] || '';
  const n = Number(amount.replace(',', '.'));
  const inUnit = item && amount.trim() ? toItemUnit(n, u, item) : undefined;
  const now = item ? balances.get(item.id)?.balance ?? 0 : 0;
  const after = inUnit === undefined ? undefined : type === 'count' ? inUnit : type === 'in' ? now + inUnit : now - inUnit;
  const ok = !!item && inUnit !== undefined && (type === 'count' ? inUnit >= 0 : inUnit > 0);
  const sections = [...new Set(items.map((i) => i.section || ''))];
  const save = async () => {
    if (!ok || !item) return;
    setState('saving');
    try {
      await addDoc(collection(db, 'stockMoves'), {
        itemId: item.id,
        type,
        qty: inUnit,
        date,
        ...(type === 'out' && block.trim() ? { block: block.trim().toUpperCase() } : {}),
        ...(note.trim() ? { note: note.trim().slice(0, 200) } : {}),
        source: 'webapp',
        at: new Date().toISOString(),
      });
      onDone();
    } catch (e) {
      console.error('Stock move save failed:', e);
      setState('error');
    }
  };
  const tone: Record<StockMoveType, string> = {
    in: '!bg-emerald-600 !text-white !border-emerald-600',
    count: '!bg-slate-900 !text-white !border-slate-900',
    out: '!bg-rose-600 !text-white !border-rose-600',
  };
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 max-w-2xl">
      <div role="radiogroup" aria-label={t('st.type')} className="grid grid-cols-3 gap-2">
        {(['in', 'count', 'out'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={type === k}
            onClick={() => setType(k)}
            className={`${btnSecondary} !justify-center !px-2 whitespace-nowrap text-[13px] sm:text-sm ${type === k ? tone[k] : ''}`}
          >
            {t(`st.type.${k}`)}
          </button>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-semibold text-slate-800">{t('st.col.product')}</span>
        <select value={itemId} onChange={(e) => (setItemId(e.target.value), setUnit(''))} className={inputCls}>
          <option value="">{t('st.pick')}</option>
          {sections.map((sec) => (
            <optgroup key={sec} label={sec}>
              {items
                .filter((i) => (i.section || '') === sec)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.producer ? ` · ${i.producer}` : ''}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {item && <span className="block text-xs text-slate-500">{t('st.now', { q: stockQty(now, item, lang) })}</span>}
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-semibold text-slate-800">{t(`st.amount.${type}`)}</span>
        <span className="flex gap-2">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!item} placeholder="0" className={`${inputCls} text-lg font-semibold`} />
          <select value={u} onChange={(e) => setUnit(e.target.value)} disabled={!item} className={`${inputCls} !w-40`} aria-label={t('st.unit')}>
            {units.map((x) => (
              <option key={x} value={x}>{x === 'pack' ? t('st.unit.pack', { n: item?.pack ?? '', u: item?.unit ?? '' }) : x}</option>
            ))}
          </select>
        </span>
      </label>
      {type === 'out' && (
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-800">{t('st.blockLabel')}</span>
          <input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="A" className={`${inputCls} max-w-[8rem]`} />
        </label>
      )}
      {more ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-800">{t('st.date')}</span>
            <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-800">{t('st.note')}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
          </label>
        </div>
      ) : (
        <button type="button" onClick={() => setMore(true)} className="text-xs font-semibold text-slate-600 underline underline-offset-2">
          {t('st.more', { date: date === todayStr() ? t('st.today') : formatShortDate(date) })}
        </button>
      )}
      <div className="flex items-center gap-3 flex-wrap border-t border-slate-100 pt-3">
        <button type="button" onClick={save} disabled={!ok || state === 'saving'} className={btnPrimary}>
          {state === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
          {t('st.save')}
        </button>
        <button type="button" onClick={onDone} className="text-sm font-semibold text-slate-600 hover:text-slate-900 px-2 min-h-9">{t('common.cancel')}</button>
        {item && after !== undefined && (
          <span className={`text-sm tabular ${after < 0 ? 'text-rose-700 font-semibold' : 'text-slate-700'}`}>
            {t('st.after', { q: stockQty(after, item, lang) })}
          </span>
        )}
        {state === 'error' && <span role="alert" className="w-full text-xs text-rose-700">{t('fr.saveError')}</span>}
      </div>
    </section>
  );
};
