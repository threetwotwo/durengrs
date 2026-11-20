import React, { useEffect, useMemo, useState } from 'react';
import { Archive, ChevronDown, ChevronRight, Loader2, Pencil, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { STOCK_UNITS, type StockItem, type StockMove, type StockMoveType, type StockUnit, byTime, newItemId, stockBalances, stockLevel, stockQty, toItemUnit } from '../shared/stock';
import { formatShortDate, todayStr } from '../lib/treatments';
import { PageHeader, btnPrimary, btnSecondary, inputCls } from './PageHeader';

const LEVEL_TONE = { out: 'bg-rose-100 text-rose-800', low: 'bg-amber-100 text-amber-900', ok: 'bg-emerald-50 text-emerald-800' } as const;
type Filter = 'all' | 'low' | 'out' | 'buy';

/**
 * The warehouse's pupuk and obat (#/stock): every product with its balance (the last stock opname plus deliveries
 * minus what went out since; src/shared/stock.ts). The cards on top filter (all, running low, out, to buy); the table
 * shows what matters at a glance (on a phone: product and balance) and a tap opens the product: its details and notes
 * (editable), and its history (from WhatsApp: PAKAI, MASUK, OPNAME; or entered here). Management adds products here
 * and records or corrects moves; a product no longer used is archived (hidden, and the bot no longer matches it).
 */
export const StockPage: React.FC = () => {
  const { t, locale } = useT();
  const { workerLabel } = useFarm();
  const [all, setAll] = useState<StockItem[] | null>(null);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [section, setSection] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // What the form on top is doing: recording a move (for a product, or any), adding a product, or editing one.
  const [form, setForm] = useState<{ kind: 'move'; itemId?: string } | { kind: 'item'; item?: StockItem } | null>(null);
  useEffect(() => {
    const onErr = (e: Error) => {
      console.error('Stock:', e);
      setError(e.message);
    };
    const a = onSnapshot(collection(db, 'stockItems'), (s) => setAll(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as StockItem).sort((x, y) => (x.order || 0) - (y.order || 0))), onErr);
    const b = onSnapshot(collection(db, 'stockMoves'), (s) => setMoves(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as StockMove)), onErr);
    return () => {
      a();
      b();
    };
  }, []);
  const bal = useMemo(() => stockBalances(moves), [moves]);
  const lang = locale.startsWith('id') ? 'id' : 'en';
  const qty = (n: number, i: StockItem) => stockQty(n, i, lang);
  const items = useMemo(() => (all || []).filter((i) => !i.archived), [all]);
  const archived = (all || []).filter((i) => i.archived);
  const levelOf = (i: StockItem) => stockLevel(i, bal.get(i.id)?.balance ?? 0);
  const count = {
    all: items.length,
    low: items.filter((i) => levelOf(i) === 'low').length,
    out: items.filter((i) => levelOf(i) === 'out').length,
    buy: items.filter((i) => i.status === 'buy').length,
  };
  const allSections = [...new Set((all || []).map((i) => i.section || ''))].filter(Boolean);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (showArchived ? archived : items).filter(
      (i) =>
        (!s || `${i.name} ${i.producer || ''} ${i.content || ''} ${i.kind || ''} ${i.method || ''} ${i.note || ''} ${(i.aliases || []).join(' ')}`.toLowerCase().includes(s)) &&
        (!section || (i.section || '') === section) &&
        (showArchived || filter === 'all' || (filter === 'buy' ? i.status === 'buy' : levelOf(i) === filter))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, archived.length, q, section, filter, showArchived, bal]);
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
  const openForm = (f: typeof form) => {
    setForm(f);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const th = 'px-3 h-10 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap';
  const td = 'px-3 py-3 border-t border-slate-100 align-middle';
  const cards: [Filter, string, number, string][] = [
    ['all', t('st.sum.items'), count.all, 'text-slate-900'],
    ['low', t('st.sum.low'), count.low, 'text-amber-700'],
    ['out', t('st.sum.out'), count.out, 'text-rose-700'],
    ['buy', t('st.sum.buy'), count.buy, 'text-sky-800'],
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title={t('st.title')}
        description={t('st.desc')}
        actions={
          <>
            <button type="button" onClick={() => openForm({ kind: 'item' })} className={btnSecondary}>
              <Plus className="w-4 h-4" />
              {t('st.newItem')}
            </button>
            <button type="button" onClick={() => openForm({ kind: 'move' })} className={btnPrimary}>
              <Plus className="w-4 h-4" />
              {t('st.add')}
            </button>
          </>
        }
      />
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {form?.kind === 'move' && all && <MoveForm items={items} balances={bal} initialItem={form.itemId} onDone={() => setForm(null)} />}
      {form?.kind === 'item' && all && (
        <ItemForm
          key={form.item?.id || 'new'}
          item={form.item}
          all={all}
          sections={allSections}
          onDone={(id) => {
            setForm(null);
            if (id) setOpen(id);
          }}
        />
      )}
      {all && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label={t('st.filter')}>
          {cards.map(([k, label, n, tone]) => {
            const on = !showArchived && filter === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => (setFilter(k), setShowArchived(false))}
                className={`text-left bg-white rounded-xl border px-3 py-2.5 transition-colors ${on ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}
              >
                <span className="block text-xs text-slate-500">{label}</span>
                <span className={`block text-2xl font-bold tabular ${tone}`}>{n}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('st.search')} aria-label={t('st.search')} className={`${inputCls} flex-1 min-w-[12rem] max-w-sm`} />
        {allSections.length > 1 && (
          <select value={section} onChange={(e) => setSection(e.target.value)} aria-label={t('st.section')} className={`${inputCls} !w-auto max-w-[16rem]`}>
            <option value="">{t('st.section.all')}</option>
            {allSections.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>
      {all && !all.length && <p className="p-8 text-center text-sm text-slate-600 bg-white rounded-xl border border-slate-200">{t('st.none')}</p>}
      {all && all.length > 0 && !rows.length && <p className="p-6 text-center text-sm text-slate-500 bg-white rounded-xl border border-slate-200">{t('st.noMatch')}</p>}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={`${th} hidden lg:table-cell w-12 text-right`}>{t('st.col.no')}</th>
                <th scope="col" className={th}>{t('st.col.product')}</th>
                <th scope="col" className={`${th} text-right`}>{t('st.col.balance')}</th>
                <th scope="col" className={`${th} hidden sm:table-cell`}>{t('st.col.pack')}</th>
                <th scope="col" className={`${th} hidden xl:table-cell`}>{t('st.col.content')}</th>
                <th scope="col" className={`${th} hidden md:table-cell`}>{t('st.col.last')}</th>
                <th scope="col" className="w-8"><span className="sr-only">{t('st.details')}</span></th>
              </tr>
            </thead>
            {sections.map((sec) => (
              <tbody key={sec}>
                {sec && (
                  <tr>
                    <th scope="colgroup" colSpan={7} className="px-3 py-2 bg-slate-100/70 border-t border-slate-200 text-left text-xs font-bold text-slate-700">
                      {sec} <span className="font-normal text-slate-500">· {rows.filter((i) => (i.section || '') === sec).length}</span>
                    </th>
                  </tr>
                )}
                {rows
                  .filter((i) => (i.section || '') === sec)
                  .map((i) => {
                    const b = bal.get(i.id);
                    const balance = b?.balance ?? 0;
                    const lv = stockLevel(i, balance);
                    const isOpen = open === i.id;
                    const last = b?.last && b.last.source !== 'sheet' ? b.last : undefined;
                    return (
                      <React.Fragment key={i.id}>
                        <tr className={`cursor-pointer ${isOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}`} onClick={() => setOpen(isOpen ? null : i.id)}>
                          <td className={`${td} hidden lg:table-cell text-right tabular text-slate-400`}>{i.no ?? ''}</td>
                          <td className={td}>
                            <button type="button" aria-expanded={isOpen} className="text-left w-full">
                              <span className="flex items-center gap-1.5 font-semibold text-slate-900">
                                {i.name}
                                {i.note && <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label={t('st.hasNote')} />}
                              </span>
                              {(i.producer || i.kind) && <span className="block text-xs text-slate-500 truncate max-w-[15rem] sm:max-w-[22rem]">{[i.producer, i.kind].filter(Boolean).join(' · ')}</span>}
                            </button>
                          </td>
                          <td className={`${td} text-right whitespace-nowrap`}>
                            <span className={`inline-block px-2 py-0.5 rounded-md font-semibold tabular ${LEVEL_TONE[lv]}`}>{qty(balance, { ...i, pack: undefined })}</span>
                            {i.pack && i.pack > 1 && balance > 0 ? (
                              <span className="block mt-0.5 text-[11px] text-slate-500 tabular">{t('st.packs', { n: (Math.round((balance / i.pack) * 10) / 10).toLocaleString(locale) })}</span>
                            ) : null}
                            {i.status === 'buy' && <span className="block mt-0.5 text-[10px] font-bold text-sky-800">{t('st.buy')}</span>}
                          </td>
                          <td className={`${td} hidden sm:table-cell whitespace-nowrap tabular text-slate-600`}>{i.pack ? `${i.pack.toLocaleString(locale)} ${i.unit}` : i.unit}</td>
                          <td className={`${td} hidden xl:table-cell text-xs text-slate-600 max-w-[18rem]`}>
                            <span className="line-clamp-2">{i.content || '—'}</span>
                          </td>
                          <td className={`${td} hidden md:table-cell whitespace-nowrap tabular text-xs text-slate-600`}>
                            {last ? (
                              <>
                                <span className="block text-slate-500">{formatShortDate(last.date)}</span>
                                {word[last.type]} {qty(last.qty, i)}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className={`${td} pl-0 pr-3 text-slate-400`}>{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={7} className="p-0 bg-slate-50 border-t border-slate-100">
                              <ItemDetail
                                item={i}
                                balance={b}
                                history={moves.filter((m) => m.itemId === i.id).sort(byTime).reverse()}
                                word={word}
                                qty={(n) => qty(n, i)}
                                who={(m) => (m.workerPhone ? workerLabel(m.workerPhone) : m.source === 'sheet' ? t('st.fromSheet') : t('st.fromApp'))}
                                onEdit={() => openForm({ kind: 'item', item: i })}
                                onRecord={() => openForm({ kind: 'move', itemId: i.id })}
                                onRemove={remove}
                              />
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
      {archived.length > 0 && (
        <button type="button" onClick={() => setShowArchived((x) => !x)} className="text-sm font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2">
          {showArchived ? t('st.archived.hide') : t('st.archived.show', { n: archived.length })}
        </button>
      )}
    </div>
  );
};

/** One product opened: its details and note (Edit), record for it, and its history (each entry deletable). */
const ItemDetail: React.FC<{
  item: StockItem;
  balance?: { since?: string; counted?: number };
  history: StockMove[];
  word: Record<StockMoveType, string>;
  qty: (n: number) => string;
  who: (m: StockMove) => string;
  onEdit: () => void;
  onRecord: () => void;
  onRemove: (m: StockMove) => void;
}> = ({ item: i, balance: b, history, word, qty, who, onEdit, onRecord, onRemove }) => {
  const { t, locale } = useT();
  const facts: [string, React.ReactNode][] = [
    [t('st.col.producer'), i.producer],
    [t('st.col.content'), i.content],
    [t('st.col.kind'), i.kind],
    [t('st.col.method'), i.method],
    [t('st.col.pack'), i.pack ? `${i.pack.toLocaleString(locale)} ${i.unit}` : i.unit],
    [t('st.min'), i.min != null ? `${i.min.toLocaleString(locale)} ${i.unit}` : t('st.min.default')],
    [t('st.aliases'), i.aliases?.length ? i.aliases.join(', ') : undefined],
    [t('st.col.counted'), b?.since ? `${formatShortDate(b.since)} · ${qty(b.counted ?? 0)}` : undefined],
  ];
  return (
    <div className="px-3 py-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" onClick={(e) => e.stopPropagation()}>
      <div className="space-y-3">
        {i.note && (
          <p className="flex gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-950 whitespace-pre-line">
            <StickyNote className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            {i.note}
          </p>
        )}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          {facts.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-slate-900">{v || <span className="text-slate-400">—</span>}</dd>
            </React.Fragment>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onEdit} className={btnSecondary}>
            <Pencil className="w-4 h-4" />
            {t('st.edit')}
          </button>
          <button type="button" onClick={onRecord} className={btnSecondary}>
            <Plus className="w-4 h-4" />
            {t('st.recordFor')}
          </button>
        </div>
      </div>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">{t('st.history')}</h3>
        {history.length ? (
          <ul className="divide-y divide-slate-100 bg-white rounded-lg border border-slate-200 max-h-80 overflow-y-auto">
            {history.map((m) => (
              <li key={m.id} className="px-3 py-2 flex items-start gap-3 text-sm">
                <span className="w-14 shrink-0 tabular text-slate-500">{formatShortDate(m.date)}</span>
                <span className="flex-1 min-w-0">
                  <strong className={m.type === 'in' ? 'text-emerald-800' : m.type === 'out' ? 'text-rose-800' : 'text-slate-900'}>
                    {word[m.type]} {m.type === 'in' ? '+' : m.type === 'out' ? '−' : '='}
                    {qty(m.qty)}
                  </strong>
                  {m.block && <span className="ml-1.5 text-slate-600">{t('st.block', { b: m.block })}</span>}
                  <span className="block text-xs text-slate-500">{[who(m), m.note].filter(Boolean).join(' · ')}</span>
                </span>
                <button type="button" onClick={() => onRemove(m)} aria-label={t('st.remove')} className="p-1.5 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{t('st.noMoves')}</p>
        )}
      </div>
    </div>
  );
};

/**
 * Add a product or edit one: name, section, producer, content, type, method, unit and pack size, the low-stock
 * minimum, other names workers use (for the WhatsApp bot), to buy, and a note. A new product can start with what is in
 * the warehouse now (a stock count). Archive: hidden here and no longer matched by the bot; its history stays.
 */
const ItemForm: React.FC<{ item?: StockItem; all: StockItem[]; sections: string[]; onDone: (id?: string) => void }> = ({ item, all, sections, onDone }) => {
  const { t } = useT();
  const [v, setV] = useState(() => ({
    name: item?.name || '',
    section: item?.section || sections[0] || '',
    newSection: '',
    producer: item?.producer || '',
    content: item?.content || '',
    kind: item?.kind || '',
    method: item?.method || '',
    unit: (item?.unit || 'kg') as StockUnit,
    pack: item?.pack !== undefined ? String(item.pack) : '',
    min: item?.min !== undefined ? String(item.min) : '',
    aliases: (item?.aliases || []).join(', '),
    buy: item?.status === 'buy',
    note: item?.note || '',
    opening: '',
  }));
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));
  const section = v.section === '__new' ? v.newSection.trim() : v.section;
  const dup = all.some((i) => i.id !== item?.id && !i.archived && i.name.trim().toLowerCase() === v.name.trim().toLowerCase());
  const bad = (s: string) => s.trim() !== '' && !(Number(s.replace(',', '.')) >= 0);
  const ok = v.name.trim() && section && !dup && !bad(v.pack) && !bad(v.min) && !bad(v.opening);
  const save = async (archive?: boolean) => {
    if (!ok && !archive) return;
    setState('saving');
    try {
      const data: Record<string, unknown> = {
        name: v.name.trim(),
        section,
        producer: v.producer.trim() || null,
        content: v.content.trim() || null,
        kind: v.kind.trim() || null,
        method: v.method.trim() || null,
        unit: v.unit,
        pack: num(v.pack) ?? null,
        min: num(v.min) ?? null,
        aliases: v.aliases.split(',').map((a) => a.trim()).filter(Boolean),
        status: v.buy ? 'buy' : null,
        note: v.note.trim().slice(0, 1000) || null,
        updatedAt: new Date().toISOString(),
      };
      // Empty fields: removed from an edited product, left out of a new one.
      if (item) {
        const edit = Object.fromEntries(Object.entries(data).map(([k, x]) => [k, x === null || (Array.isArray(x) && !x.length) ? deleteField() : x]));
        await updateDoc(doc(db, 'stockItems', item.id), archive !== undefined ? { archived: archive } : edit);
        onDone(item.id);
        return;
      }
      const { id, no, order } = newItemId(all, section);
      const clean = Object.fromEntries(Object.entries(data).filter(([, x]) => x !== null && !(Array.isArray(x) && !x.length)));
      await setDoc(doc(db, 'stockItems', id), { ...clean, no, order, source: 'webapp', createdAt: new Date().toISOString() });
      const opening = num(v.opening);
      if (opening !== undefined) await addDoc(collection(db, 'stockMoves'), { itemId: id, type: 'count', qty: opening, date: todayStr(), note: t('st.opening'), source: 'webapp', at: new Date().toISOString() });
      onDone(id);
    } catch (e) {
      console.error('Stock item save failed:', e);
      setState('error');
    }
  };
  const field = (label: string, el: React.ReactNode, hint?: string, wide?: boolean) => (
    <label className={`block space-y-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      {el}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{item ? t('st.editItem', { name: item.name }) : t('st.newItem')}</h2>
        <button type="button" onClick={() => onDone()} aria-label={t('common.cancel')} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field(t('st.f.name'), <input value={v.name} onChange={set('name')} className={inputCls} placeholder="TSP 46% Cap Kuda (50kg)" autoFocus />, dup ? t('st.f.dup') : undefined, true)}
        {field(
          t('st.section'),
          <>
            <select value={v.section} onChange={set('section')} className={inputCls}>
              {sections.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="__new">{t('st.f.newSection')}</option>
            </select>
            {v.section === '__new' && <input value={v.newSection} onChange={set('newSection')} className={`${inputCls} mt-2`} placeholder="G. Alat" />}
          </>
        )}
        {field(t('st.col.producer'), <input value={v.producer} onChange={set('producer')} className={inputCls} />)}
        {field(t('st.f.unit'), (
          <span className="flex gap-2">
            <select value={v.unit} onChange={set('unit')} className={`${inputCls} !w-24`} aria-label={t('st.f.unit')}>
              {STOCK_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <input inputMode="decimal" value={v.pack} onChange={set('pack')} className={inputCls} placeholder={t('st.f.pack.ph')} aria-label={t('st.f.pack')} />
          </span>
        ), t('st.f.unit.hint'))}
        {field(t('st.min'), <input inputMode="decimal" value={v.min} onChange={set('min')} className={inputCls} placeholder={t('st.min.default')} />, t('st.min.hint', { u: v.unit }))}
        {field(t('st.col.content'), <input value={v.content} onChange={set('content')} className={inputCls} />, undefined, true)}
        {field(t('st.col.kind'), <input value={v.kind} onChange={set('kind')} className={inputCls} placeholder="Pupuk Makro Tunggal - P" />)}
        {field(t('st.col.method'), <input value={v.method} onChange={set('method')} className={inputCls} placeholder="Tabur, Semprot, Kocor" />)}
        {field(t('st.aliases'), <input value={v.aliases} onChange={set('aliases')} className={inputCls} placeholder="TSP, SP36" />, t('st.aliases.hint'), true)}
        {field(t('st.note'), <textarea value={v.note} onChange={set('note')} rows={3} maxLength={1000} className={`${inputCls} !h-auto py-2`} placeholder={t('st.f.note.ph')} />, undefined, true)}
        {!item && field(t('st.f.opening'), <input inputMode="decimal" value={v.opening} onChange={set('opening')} className={inputCls} placeholder="0" />, t('st.f.opening.hint', { u: v.unit }))}
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 self-end min-h-11">
          <input type="checkbox" checked={v.buy} onChange={set('buy')} className="w-4 h-4 accent-sky-700" />
          {t('st.f.buy')}
        </label>
      </div>
      <div className="flex items-center gap-3 flex-wrap border-t border-slate-100 pt-3">
        <button type="button" onClick={() => save()} disabled={!ok || state === 'saving'} className={btnPrimary}>
          {state === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
          {item ? t('st.save') : t('st.f.create')}
        </button>
        <button type="button" onClick={() => onDone()} className="text-sm font-semibold text-slate-600 hover:text-slate-900 px-2 min-h-9">{t('common.cancel')}</button>
        {item && (
          <button
            type="button"
            onClick={() => (item.archived || window.confirm(t('st.archive.confirm', { name: item.name }))) && save(!item.archived)}
            className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-rose-700 px-2 min-h-9"
          >
            <Archive className="w-4 h-4" />
            {item.archived ? t('st.unarchive') : t('st.archive')}
          </button>
        )}
        {state === 'error' && <span role="alert" className="w-full text-xs text-rose-700">{t('fr.saveError')}</span>}
      </div>
    </section>
  );
};

/**
 * Management records here (the warehouse reports on WhatsApp): what kind first, Incoming by default, then Stock
 * count, Outgoing last; the product; how much, in packs when it comes in packs; and before saving, what the balance
 * will be. The day (today) and a note fold away; the block only asks when something goes out.
 */
const MoveForm: React.FC<{ items: StockItem[]; balances: Map<string, { balance: number }>; initialItem?: string; onDone: () => void }> = ({ items, balances, initialItem, onDone }) => {
  const { t, locale } = useT();
  const lang = locale.startsWith('id') ? 'id' : 'en';
  const [type, setType] = useState<StockMoveType>('in');
  const [itemId, setItemId] = useState(initialItem || '');
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
