import React, { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useT } from '../i18n';
import { fruitsUrl, goBack } from '../lib/router';
import { BOARD_GRADES, type BoardTree, gradeBoard } from '../lib/fruits';
import { formatShortDate } from '../lib/treatments';
import { GradeTag } from './HarvestBits';
import { Link } from './Link';
import { PageHeader } from './PageHeader';
import { useFruits, useVarietyName } from './FruitsPage';

/** Each grade's column, tinted as its medal: gold, silver, bronze; ungraded grey. */
const COLUMN: Record<(typeof BOARD_GRADES)[number], string> = {
  high: 'bg-[#fdf6dc]',
  mid: 'bg-[#f1f3f6]',
  low: 'bg-[#f8ece1]',
  ungraded: 'bg-slate-50',
};

/**
 * The grading board (#/harvest/grades), as management keeps it in its sheet: one band per variety, its fruiting
 * trees (fruit picked this season) set out in High, Mid, Low and Ungraded columns. A tree shows its total when
 * fully scored and how many fruits it gave; tapping it lists those fruits.
 */
export const GradeBoardPage: React.FC = () => {
  const { t, locale } = useT();
  const rows = useFruits();
  const name = useVarietyName();
  const board = useMemo(() => gradeBoard(rows), [rows]);
  const fmt = (n: number, d = 0) => n.toLocaleString(locale, { maximumFractionDigits: d });
  const counts = Object.fromEntries(BOARD_GRADES.map((g) => [g, board.reduce((n, v) => n + v.byGrade[g].length, 0)]));

  // A tree in its cell: its code (to its fruits), its total when fully scored; commas between.
  const treeLink = (tr: BoardTree, i: number) => (
    <React.Fragment key={tr.treeId}>
      {i > 0 && <span className="text-slate-400">, </span>}
      <Link
        to={fruitsUrl({ q: tr.treeId })}
        title={t('gb.tree.title', {
          tree: tr.treeId,
          n: tr.fruits,
          kg: fmt(tr.grams / 1000, 1),
          graded: tr.gradedOn ? t('gb.graded', { date: formatShortDate(tr.gradedOn) }) : '',
        })}
        className="whitespace-nowrap font-mono font-bold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
      >
        {tr.treeId}
      </Link>
      {tr.pct !== undefined && <span className="ml-0.5 text-[11px] text-slate-500 tabular whitespace-nowrap">{fmt(tr.pct)}%</span>}
    </React.Fragment>
  );

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => goBack('/harvest')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 min-h-9">
        <ArrowLeft className="w-4 h-4" />
        {t('nav.harvest')}
      </button>
      <PageHeader title={t('gb.title')} description={t('gb.desc')} />
      {!board.length ? (
        <p className="p-8 text-center text-sm text-slate-600 bg-white rounded-xl border border-slate-200">{t('gb.none')}</p>
      ) : (
        // One row per variety; each grade's cell lists its trees.
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
                      <span className="text-[11px] text-slate-300 tabular">{t('gb.treeCount', { n: counts[g] })}</span>
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
                      {v.byGrade[g].length ? v.byGrade[g].map(treeLink) : <span className="text-slate-300">{t('gb.empty')}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link to={fruitsUrl()} className="inline-block text-sm font-semibold text-emerald-800 hover:underline">
        {t('gb.toFruits')} →
      </Link>
    </div>
  );
};
