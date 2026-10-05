import React, { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { useQueryParams } from '../lib/router';
import { CROP_STAGES, CropStage } from '../lib/fieldData';
import { cropFunnel } from '../lib/crop';
import { diffDays, formatShortDate, todayStr } from '../lib/treatments';
import { PageHeader } from './PageHeader';
import { DuePill, MissedLink, ViaWhatsApp } from './FieldFirst';
import { CropCountSheet, FunnelStrip, GradeBar, GradingCriteria, TreeLink } from './CropWidgets';
import { HarvestLog, HarvestSheet } from './FieldRecords';
import { HarvestView } from './HarvestView';
import { StagePill } from './GuideWidgets';
import { useCrops } from './useCrops';

/**
 * Harvest: every tree from flowers to graded fruit.
 *   1. Funnel (farm or one block): flower clusters → fruit set → kept → on the trees → harvested by grade
 *   2. What to count now (trees whose stage calls for a count) and the harvest windows per block
 *   3. Every tree's counts, with one button for its next step
 *   4. Grading criteria, the harvest log, bloom dates and the month forecast
 */
export const HarvestPage: React.FC = () => {
  const { t } = useT();
  const { blocks, harvests, archivedHarvestTrees } = useFarm();
  const { crops, seasons } = useCrops();
  const [params, setParams] = useQueryParams();
  const block = params.get('block') || 'all';
  const todoOnly = params.get('todo') === '1';
  const [counting, setCounting] = useState<{ treeId?: string; stage?: CropStage } | null>(null);
  const [harvesting, setHarvesting] = useState<{ treeId?: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const today = todayStr();

  const inBlock = useMemo(() => crops.filter((c) => block === 'all' || c.tree.block === block), [crops, block]);
  const funnel = useMemo(
    () => cropFunnel(inBlock, seasons, harvests.filter((h) => block === 'all' || h.block === block), archivedHarvestTrees),
    [inBlock, seasons, harvests, block, archivedHarvestTrees]
  );
  const toCount = inBlock.filter((c) => c.next && c.next.kind !== 'harvest' && c.next.overdue);
  const toPick = inBlock.filter((c) => c.next?.kind === 'harvest');
  const rows = (todoOnly ? inBlock.filter((c) => c.next?.overdue || c.next?.kind === 'harvest') : inBlock).sort(
    (a, b) => a.tree.block.localeCompare(b.tree.block, undefined, { numeric: true }) || a.tree.id.localeCompare(b.tree.id, undefined, { numeric: true })
  );

  // Harvest windows per block: from the first flowers + fastest variety to the last flowers + slowest.
  const windows = seasons
    .filter((s) => (block === 'all' || s.block === block) && s.harvestFrom && s.harvestTo && diffDays(s.harvestTo, today) >= -14 && !s.outdated)
    .map((s) => {
      const blockCrops = crops.filter((c) => c.tree.block === s.block);
      return {
        s,
        remaining: blockCrops.reduce((n, c) => n + (c.remaining || 0), 0),
        picked: cropFunnel(blockCrops, seasons, harvests.filter((h) => h.block === s.block), archivedHarvestTrees).harvested.fruits,
        days: diffDays(s.harvestFrom!, today),
      };
    })
    .sort((a, b) => a.s.harvestFrom!.localeCompare(b.s.harvestFrom!));

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('hp.title')}
        description={t('hp.desc')}
        actions={
          <div className="flex flex-col items-start sm:items-end gap-0.5">
            <ViaWhatsApp text={t('ff.viaTree')} />
            <span className="flex flex-wrap gap-x-3">
              <MissedLink onClick={() => setCounting({})} label={t('ff.missedCount')} />
              <MissedLink onClick={() => setHarvesting({})} label={t('ff.missedHarvest')} />
            </span>
          </div>
        }
      />

      <div role="group" aria-label={t('common.block')} className="flex flex-wrap gap-1.5">
        {['all', ...blocks].map((b) => (
          <button
            key={b}
            type="button"
            aria-pressed={block === b}
            onClick={() => setParams({ block: b === 'all' ? null : b })}
            className={`min-h-10 px-3.5 rounded-full border text-sm font-semibold ${
              block === b ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {b === 'all' ? t('common.allBlocks') : t('common.blockN', { n: b })}
          </button>
        ))}
      </div>

      {msg && (
        <p role="status" className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {msg}
        </p>
      )}

      <FunnelStrip funnel={funnel} />

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="lg:col-span-5 bg-white rounded-xl border border-slate-200 overflow-hidden" aria-labelledby="hp-todo">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
            <h2 id="hp-todo" className="text-sm font-bold text-slate-900">
              {t('hp.todo')} <span className="text-slate-500 font-medium tabular">({toCount.length + toPick.length})</span>
            </h2>
            {toCount.length + toPick.length > 0 && (
              <button type="button" onClick={() => setParams({ todo: todoOnly ? null : '1' })} className="text-xs font-semibold text-emerald-700 min-h-8">
                {todoOnly ? t('hp.showAll') : t('hp.onlyTodo')}
              </button>
            )}
          </div>
          {toCount.length + toPick.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-600">{t('hp.todo.none')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...toPick, ...toCount].slice(0, 8).map((c) => (
                <li key={c.tree.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <TreeLink id={c.tree.id} />
                    <span className="ml-2 inline-flex gap-1 align-middle">
                      {c.waves.slice(0, 2).map((w) => (
                        <StagePill key={w.date} stage={w.stage} />
                      ))}
                    </span>
                  </span>
                  <DuePill crop={c} />
                </li>
              ))}
            </ul>
          )}
          {toCount.length + toPick.length > 8 && (
            <button type="button" onClick={() => setParams({ todo: '1' })} className="w-full px-4 py-2.5 border-t border-slate-100 text-xs font-semibold text-emerald-700">
              {t('hp.more', { n: toCount.length + toPick.length - 8 })}
            </button>
          )}
        </section>

        <section className="lg:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden" aria-labelledby="hp-win">
          <h2 id="hp-win" className="px-4 py-3 border-b border-slate-200 text-sm font-bold text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-emerald-600" />
            {t('hp.windows')}
          </h2>
          {windows.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-600">{t('hp.windows.none')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {windows.map(({ s, remaining, picked, days }) => {
                const inHarvest = days <= 0 && diffDays(s.harvestTo!, today) >= 0;
                return (
                  <li key={s.block} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="min-w-24 font-semibold text-slate-900">{t('common.blockN', { n: s.block })}</span>
                    <span className="text-sm text-slate-700 tabular">
                      {s.harvestFrom === s.harvestTo ? formatShortDate(s.harvestFrom!) : `${formatShortDate(s.harvestFrom!)} - ${formatShortDate(s.harvestTo!)}`}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${
                        inHarvest ? 'bg-emerald-600 border-emerald-600 text-white' : days <= 14 && days > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                    >
                      {inHarvest ? t('hp.win.now') : days > 0 ? t('sched.hv.in', { n: days }) : t('hp.win.ended')}
                    </span>
                    <span className="ml-auto text-xs text-slate-600 tabular">
                      {t('hp.win.fruit', { left: remaining, picked })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden" aria-labelledby="hp-trees">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <h2 id="hp-trees" className="text-sm font-bold text-slate-900">
            {t('hp.trees')} <span className="text-slate-500 font-medium tabular">({rows.length})</span>
          </h2>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 min-h-8">
            <input type="checkbox" checked={todoOnly} onChange={(e) => setParams({ todo: e.target.checked ? '1' : null })} className="w-4 h-4 accent-emerald-600" />
            {t('hp.onlyTodo')}
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-600 bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">{t('crop.tree')}</th>
                <th className="px-3 py-2.5 text-left font-semibold">{t('hp.col.stage')}</th>
                {CROP_STAGES.map((st) => (
                  <th key={st} className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{t(`crop.stage.${st}.short`)}</th>
                ))}
                <th className="px-3 py-2.5 text-left font-semibold">{t('crop.stage.harvested')}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.tree.id} className={c.next?.overdue ? 'bg-amber-50/40' : ''}>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <TreeLink id={c.tree.id} />
                    <span className="block text-xs text-slate-500">{[c.tree.variant, t('common.blockN', { n: c.tree.block })].filter(Boolean).join(' · ')}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {c.waves.length ? c.waves.map((w) => <StagePill key={w.date} stage={w.stage} />) : <span className="text-xs text-slate-400">{t('hp.noBloom')}</span>}
                    </span>
                  </td>
                  {CROP_STAGES.map((st) => {
                    const v = c.counts[st];
                    return (
                      <td key={st} className="px-3 py-2.5 text-right tabular" title={v ? formatShortDate(v.date) : undefined}>
                        {v ? (
                          <span className={v.fromTree ? 'text-slate-500' : 'font-semibold text-slate-900'}>{st === 'onTree' && c.remaining !== undefined ? c.remaining : v.count}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 min-w-32">
                    {c.harvested.fruits ? (
                      <>
                        <span className="font-semibold tabular">{c.harvested.fruits}</span>
                        <GradeBar grades={c.harvested.grades} className="mt-1" />
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {c.next && <DuePill crop={c} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">{t('hp.trees.help')}</p>
      </section>

      <GradingCriteria open={params.get('show') === 'grading'} />
      <HarvestLog />
      <HarvestView />

      {counting && (
        <CropCountSheet crops={crops} treeId={counting.treeId} stage={counting.stage} onClose={() => setCounting(null)} onSaved={setMsg} />
      )}
      {harvesting && (
        <HarvestSheet initialTree={harvesting.treeId} initialBlock={block === 'all' ? undefined : block} onClose={() => setHarvesting(null)} onSaved={setMsg} />
      )}
    </div>
  );
};
