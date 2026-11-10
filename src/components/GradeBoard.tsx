import React, { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { useFarm } from '../context/FarmContext';
import { currentGrades } from '../lib/grading';
import { fruitsUrl, treeUrl } from '../lib/router';
import { BOARD_GRADES, type BoardTree, gradeBoard, hasPotential } from '../lib/fruits';
import { fruitOnTree } from '../lib/crop';
import { useCrops } from './useCrops';
import { formatShortDate } from '../lib/treatments';
import { GradeTag } from './HarvestBits';
import { Link } from './Link';
import { useFruits, useVarietyName } from './useFruits';

/** Each grade's column, tinted as its medal: gold, silver, bronze; ungraded grey. */
const COLUMN: Record<(typeof BOARD_GRADES)[number], string> = {
  high: 'bg-[#fdf6dc]',
  midhigh: 'bg-[#f8f4e8]',
  mid: 'bg-[#f1f3f6]',
  low: 'bg-[#f8ece1]',
  ungraded: 'bg-slate-50',
};

/**
 * The grading board (#/harvest/grades, and on the dashboard), as management keeps it in its sheet: one band per
 * variety, its trees with fruit to harvest (fruit counted on the tree, or picked this season) set out by grade; trees
 * with neither fold behind a count. A tree shows its total when fully scored; tapping it lists its fruits.
 */
export const GradeBoard: React.FC = () => {
  const { t, locale } = useT();
  const rows = useFruits();
  const name = useVarietyName();
  const { trees, treeGrades } = useFarm();
  const { crops } = useCrops();
  // Which variety/grade lists also show their trees with no fruit to harvest.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const board = useMemo(() => {
    const onTree = new Map(crops.map((c) => [c.tree.id, fruitOnTree(c)]));
    return gradeBoard(rows, trees, currentGrades(treeGrades), (id) => onTree.get(id) || 0);
  }, [rows, trees, treeGrades, crops]);
  const fmt = (n: number, d = 0) => n.toLocaleString(locale, { maximumFractionDigits: d });
  // Each grade's trees with fruit to harvest (the ones on show).
  const counts = Object.fromEntries(BOARD_GRADES.map((g) => [g, board.reduce((n, v) => n + v.byGrade[g].filter(hasPotential).length, 0)]));

  // A tree in its cell: its code (to its fruits), its total when fully scored; commas between.
  const treeLink = (tr: BoardTree, i: number) => (
    <React.Fragment key={tr.treeId}>
      {i > 0 && <span className="text-slate-400">, </span>}
      <Link
        to={tr.fruits ? fruitsUrl({ q: tr.treeId }) : treeUrl(tr.treeId)}
        title={t(hasPotential(tr) ? 'gb.tree.title' : 'gb.tree.noFruit', {
          tree: tr.treeId,
          n: tr.fruits,
          on: tr.onTree,
          kg: fmt(tr.grams / 1000, 1),
          graded: tr.gradedOn ? t('gb.graded', { date: formatShortDate(tr.gradedOn) }) : '',
        })}
        className={`whitespace-nowrap font-mono underline underline-offset-4 ${hasPotential(tr) ? 'font-bold text-slate-900 decoration-slate-300 hover:decoration-slate-900' : 'text-slate-500 decoration-slate-200 hover:text-slate-900'}`}
      >
        {tr.treeId}
      </Link>
      {tr.pct !== undefined && <span className="ml-0.5 text-[11px] text-slate-500 tabular whitespace-nowrap">{fmt(tr.pct)}%</span>}
    </React.Fragment>
  );

  // Trees grouped by block (the letters of their code), each block's by number.
  const byBlock = (list: BoardTree[]): Array<[string, BoardTree[]]> => {
    const part = (id: string) => {
      const m = id.match(/^([A-Z]+)(\d+)/i);
      return m ? [m[1].toUpperCase(), Number(m[2])] as const : [id, 0] as const;
    };
    const groups = new Map<string, BoardTree[]>();
    for (const tr of list) groups.set(part(tr.treeId)[0], [...(groups.get(part(tr.treeId)[0]) || []), tr]);
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([b, ts]) => [b, ts.sort((x, y) => part(x.treeId)[1] - part(y.treeId)[1])]);
  };

  // A grade's trees: those with fruit to harvest; the rest fold behind "+N trees without fruit".
  const cell = (variety: string, g: (typeof BOARD_GRADES)[number], list: BoardTree[]) => {
    const key = `${variety}|${g}`;
    const shown = open.has(key) ? list : list.filter(hasPotential);
    const hidden = list.length - shown.length;
    return (
      <>
        {!shown.length ? (
          !hidden ? <span className="text-slate-300">{t('gb.empty')}</span> : null
        ) : (
          // Every grade: one line per block, its trees by number (A2, A10, A21), as on the farm's board.
          byBlock(shown).map(([block, ts]) => (
            <span key={block} className="flex gap-2">
              <span className="w-5 shrink-0 text-xs font-bold text-slate-400 pt-1">{block}</span>
              <span className="min-w-0">{ts.map(treeLink)}</span>
            </span>
          ))
        )}
        {hidden > 0 && (
          <button type="button" onClick={() => setOpen((o) => new Set(o).add(key))} className={`${shown.length ? 'ml-2' : ''} text-xs font-semibold text-slate-600 underline underline-offset-2`}>
            {t('gb.more', { n: hidden })}
          </button>
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {!board.length ? (
        <p className="p-8 text-center text-sm text-slate-600 bg-white rounded-xl border border-slate-200">{t('gb.none')}</p>
      ) : (
        <>
        {/* Phone: each variety a card, its grades one under the other, each listing its trees. */}
        <div className="sm:hidden space-y-3">
          {board.map((v) => (
            <section key={v.variety || '-'} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <h2 className="px-3 py-2.5 flex items-baseline gap-2 border-b border-slate-100">
                <span className="font-bold text-emerald-900">{name(v.variety) || v.variety || '—'}</span>
                <span className="ml-auto text-xs text-slate-500 tabular">{t('gb.trees', { n: fmt(v.trees), f: fmt(v.fruits) })}</span>
              </h2>
              <dl>
                {BOARD_GRADES.map((g) => {
                  const list = v.byGrade[g];
                  return (
                    <div key={g} className={`${COLUMN[g]} px-3 py-2 flex gap-3 border-t border-white first:border-t-0`}>
                      <dt className="w-[5.5rem] shrink-0 pt-1">
                        <GradeTag grade={g} />
                        <span className="block mt-1 text-[10px] leading-tight text-slate-500">{t(`gb.band.${g}`)}</span>
                      </dt>
                      <dd className="min-w-0 flex-1 leading-7 break-words">{cell(v.variety, g, list)}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </div>
        {/* Wider screens: one row per variety; each grade's cell lists its trees. */}
        <div className="hidden sm:block bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-14 sm:w-40" />
              {BOARD_GRADES.map((g) => <col key={g} />)}
            </colgroup>
            <thead className="bg-slate-900 text-white">
              <tr>
                <th scope="col" className="px-2 sm:px-3 py-2 text-left text-xs font-semibold text-slate-300">{t('fr.col.variant')}</th>
                {BOARD_GRADES.map((g) => (
                  <th key={g} scope="col" className="px-1.5 sm:px-3 py-2 text-left font-normal">
                    <span className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <GradeTag grade={g} />
                      <span className="text-[11px] text-slate-300 tabular">
                        {t(`gb.band.${g}`)} · {t('gb.treeCount', { n: counts[g] })}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.map((v) => (
                <tr key={v.variety || '-'} className="border-t border-slate-200 align-top">
                  <th scope="row" className="px-2 sm:px-3 py-2.5 text-left font-normal" title={t('gb.trees', { n: fmt(v.trees), f: fmt(v.fruits) })}>
                    <span className="block font-bold text-emerald-900 sm:hidden font-mono">{v.variety || '—'}</span>
                    <span className="hidden sm:block font-bold text-emerald-900">{name(v.variety) || v.variety || '—'}</span>
                    <span className="hidden sm:block text-xs text-slate-500 tabular">{t('gb.trees', { n: fmt(v.trees), f: fmt(v.fruits) })}</span>
                  </th>
                  {BOARD_GRADES.map((g) => (
                    <td key={g} className={`${COLUMN[g]} px-1.5 sm:px-3 py-2.5 leading-7 break-words`}>
                      {cell(v.variety, g, v.byGrade[g])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
};
