import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Trash2 } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { fruitUrl, goBack, treeUrl } from '../lib/router';
import { type KupasBox, shortBox, yields } from '../lib/kupas';
import { toCsv } from '../lib/kebun';
import { formatShortDate, todayStr, addDays } from '../lib/treatments';
import { GradeTag } from './HarvestBits';
import { Link } from './Link';
import { PageHeader, btnSecondary } from './PageHeader';

/**
 * The kupas station's boxes (#/harvest/kupas), recorded on WhatsApp (KUPAS A6, then each box's weight;
 * bot/lib/kupas.js): newest peeling day first, each box with its code, tree, the tree's grade then, the day its
 * fruit was picked, its weight, and the yield of that tree's picking (kupas grams ÷ fruit grams).
 */
export const KupasPage: React.FC = () => {
  const { t, locale } = useT();
  const { harvests, workerLabel } = useFarm();
  const [boxes, setBoxes] = useState<KupasBox[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'kupasBoxes'),
        (s) => setBoxes(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as KupasBox)),
        (e) => {
          console.error('Kupas boxes:', e);
          setError(e.message);
          setBoxes([]);
        }
      ),
    []
  );
  const fmt = (n: number, d = 0) => n.toLocaleString(locale, { maximumFractionDigits: d });
  const fruitG = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of harvests) {
      if (!h.treeId) continue;
      const k = `${h.treeId}|${h.date}`;
      m.set(k, (m.get(k) || 0) + (h.items || []).reduce((s, f) => s + (Number(f.weightG) || 0), 0));
    }
    return m;
  }, [harvests]);
  const rows = useMemo(
    () => [...(boxes || [])].sort((a, b) => b.date.localeCompare(a.date) || a.code.localeCompare(b.code)),
    [boxes]
  );
  const yieldOf = useMemo(() => yields(rows, (tree, date) => fruitG.get(`${tree}|${date}`) || 0), [rows, fruitG]);
  const total = rows.reduce((s, b) => s + (Number(b.weightG) || 0), 0);
  const dayLabel = (d: string) => (d === todayStr() ? t('fr.today') : d === addDays(todayStr(), -1) ? t('fr.yesterday') : formatShortDate(d));

  const csv = () => {
    const head = [t('ku.col.code'), t('ku.col.tree'), 'Variety', t('ku.col.grade'), t('ku.col.picked'), 'Peeled', t('ku.col.weight'), 'Fruit codes', t('ku.col.by')];
    const body = rows.map((b) => [b.code, b.treeId, b.variant || '', b.grade || '', b.fruitDate, b.date, b.weightG, (b.fruitCodes || []).join(' '), b.workerPhone ? workerLabel(b.workerPhone) : '']);
    const blob = new Blob(['﻿' + toCsv([head, ...body])], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kupas_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const remove = async (b: KupasBox) => {
    if (!window.confirm(t('ku.remove.confirm', { code: shortBox(b.code) }))) return;
    try {
      await deleteDoc(doc(db, 'kupasBoxes', b.id));
    } catch (e: any) {
      console.error('Box delete failed:', e);
      setError(e.message);
    }
  };

  const th = 'px-2.5 h-10 text-left text-[11px] font-semibold text-slate-300 whitespace-nowrap';
  const td = 'px-2.5 py-2 border-b border-slate-100 whitespace-nowrap';
  return (
    <div className="space-y-4">
      <button type="button" onClick={() => goBack('/harvest')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 min-h-9">
        <ArrowLeft className="w-4 h-4" />
        {t('nav.harvest')}
      </button>
      <PageHeader
        title={t('ku.title')}
        description={t('ku.desc').replace(/\*/g, '')}
        actions={
          rows.length ? (
            <button type="button" onClick={csv} className={btnSecondary}>
              <Download className="w-4 h-4" />
              {t('ku.csv')}
            </button>
          ) : undefined
        }
      />
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {boxes && !rows.length && <p className="p-8 text-center text-sm text-slate-600 bg-white rounded-xl border border-slate-200">{t('ku.none')}</p>}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th scope="col" className={`${th} sticky left-0 bg-slate-900`}>{t('ku.col.code')}</th>
                <th scope="col" className={th}>{t('ku.col.tree')}</th>
                <th scope="col" className={th}>{t('ku.col.grade')}</th>
                <th scope="col" className={`${th} hidden sm:table-cell`}>{t('ku.col.picked')}</th>
                <th scope="col" className={`${th} text-right`}>{t('ku.col.weight')}</th>
                <th scope="col" className={`${th} text-right`}>{t('ku.col.yield')}</th>
                <th scope="col" className={`${th} hidden sm:table-cell`}>{t('ku.col.by')}</th>
                <th scope="col" className={th}><span className="sr-only">{t('ku.remove', { code: '' })}</span></th>
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((b, i) => {
                const y = yieldOf.get(`${b.treeId}|${b.fruitDate}`);
                const firstOfGroup = rows.findIndex((x) => x.treeId === b.treeId && x.fruitDate === b.fruitDate) === i;
                const day = rows.filter((x) => x.date === b.date);
                return (
                  <React.Fragment key={b.id}>
                    {b.date !== rows[i - 1]?.date && (
                      <tr>
                        <td colSpan={8} className="p-0 bg-slate-100 border-b border-slate-200">
                          <span className="sticky left-0 inline-flex items-baseline gap-2 px-2.5 py-1.5 text-xs">
                            <strong className="text-slate-900">{dayLabel(b.date)}</strong>
                            <span className="text-slate-600">{t('ku.day', { n: day.length, kg: fmt(day.reduce((s, x) => s + x.weightG, 0) / 1000, 2) })}</span>
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr className="hover:bg-slate-50 group">
                      <td className={`${td} sticky left-0 bg-white group-hover:bg-slate-50 font-mono text-xs font-semibold text-slate-900`} title={b.code}>
                        {shortBox(b.code)}
                      </td>
                      <td className={td}>
                        <Link to={treeUrl(b.treeId)} className="font-mono font-bold text-slate-900 hover:underline">{b.treeId}</Link>
                        {b.variant && <span className="ml-1.5 text-xs text-slate-500">{b.variant}</span>}
                      </td>
                      <td className={td}>{b.grade ? <GradeTag grade={b.grade} /> : '—'}</td>
                      <td className={`${td} hidden sm:table-cell text-slate-700`}>
                        {b.fruitCodes?.[0] ? (
                          <Link to={fruitUrl(b.fruitCodes[0])} className="hover:underline" title={(b.fruitCodes || []).join(', ')}>
                            {formatShortDate(b.fruitDate)} · {b.fruitCodes.length}×
                          </Link>
                        ) : (
                          formatShortDate(b.fruitDate)
                        )}
                      </td>
                      <td className={`${td} text-right font-semibold`}>{fmt(b.weightG)}</td>
                      <td className={`${td} text-right text-slate-700`} title={y ? t('ku.yield.title', { kupas: fmt(y.kupasG), fruit: fmt(y.fruitG) }) : undefined}>
                        {firstOfGroup && y?.pct !== undefined ? `${fmt(y.pct, 1)}%` : ''}
                      </td>
                      <td className={`${td} hidden sm:table-cell text-slate-600`}>{b.workerPhone ? workerLabel(b.workerPhone) : ''}</td>
                      <td className={`${td} text-right`}>
                        <button type="button" onClick={() => remove(b)} aria-label={t('ku.remove', { code: shortBox(b.code) })} className="p-1.5 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold text-slate-800 tabular">
              <tr>
                <th scope="row" colSpan={4} className="px-2.5 py-2 text-left text-xs">{t('ku.sum', { n: rows.length, kg: fmt(total / 1000, 2) })}</th>
                <td className="px-2.5 py-2 text-right">{fmt(total)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};
