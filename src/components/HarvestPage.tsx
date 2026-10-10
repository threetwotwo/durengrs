import React, { useMemo, useState } from 'react';
import { CheckCircle2, MessageCircle, Pencil, Plus } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { treeUrl, useQueryParams } from '../lib/router';
import { cropFunnel, fruitOnTree } from '../lib/crop';
import { buildFieldLog } from '../lib/fieldLog';
import { saveHarvestCycle } from '../lib/insights';
import { diffDays, formatShortDate, todayStr } from '../lib/treatments';
import { PageHeader } from './PageHeader';
import { GradeBar } from './CropWidgets';
import { HarvestSheet } from './FieldRecords';
import { Link } from './Link';
import { RecordCard, RecordGrid } from './Record';
import { useCrops } from './useCrops';

const PAGE = 12;

/**
 * Harvest, end to end in one page:
 *   1. a worker reports a harvest on WhatsApp (tree ID, a photo, "panen 12 buah 30 kg"): Gemini files it as a harvest
 *      record against the tree's flowering (bot/lib/ai.js); the owner can also add one here
 *   2. this season at a glance: fruit picked (with grades), fruit still on the trees, trees ready to pick
 *   3. each block's harvest window (from its flowering date and the varieties' ripening days), editable
 *   4. the harvest records themselves, photos first
 * The numbers come from the same crop engine as Today and the tree pages (lib/crop.ts), so they always agree.
 */
export const HarvestPage: React.FC = () => {
  const { t, locale } = useT();
  const { blocks, harvests, archivedHarvestTrees } = useFarm();
  const { crops, seasons } = useCrops();
  const [params, setParams] = useQueryParams();
  const block = params.get('block') || 'all';
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const today = todayStr();

  const inBlock = useMemo(() => crops.filter((c) => block === 'all' || c.tree.block === block), [crops, block]);
  const blockHarvests = useMemo(() => harvests.filter((h) => block === 'all' || h.block === block), [harvests, block]);
  const season = useMemo(() => cropFunnel(inBlock, seasons, blockHarvests, archivedHarvestTrees), [inBlock, seasons, blockHarvests, archivedHarvestTrees]);
  const onTrees = inBlock.reduce((n, c) => n + fruitOnTree(c), 0);
  const toPick = inBlock.filter((c) => c.next?.kind === 'harvest').sort((a, b) => a.tree.id.localeCompare(b.tree.id, undefined, { numeric: true }));

  // Each block's window: from the first flowers + the fastest variety to the last flowers + the slowest.
  const windows = seasons
    .filter((s) => (block === 'all' || s.block === block) && !s.young)
    .map((s) => {
      const blockCrops = crops.filter((c) => c.tree.block === s.block);
      const picked = cropFunnel(blockCrops, seasons, harvests.filter((h) => h.block === s.block), archivedHarvestTrees).harvested;
      return {
        s,
        onTrees: blockCrops.reduce((n, c) => n + fruitOnTree(c), 0),
        picked,
        days: s.harvestFrom ? diffDays(s.harvestFrom, today) : null,
        dated: !!(s.floweredOn && s.harvestFrom && s.harvestTo && !s.outdated),
      };
    })
    .sort((a, b) => (a.dated === b.dated ? (a.s.harvestFrom || '').localeCompare(b.s.harvestFrom || '') : a.dated ? -1 : 1));

  // The records: this season's harvests (since the block's first flowering of the season), newest first.
  const records = useMemo(() => {
    const start = new Map(seasons.map((s) => [s.block, s.waves[0]?.date]));
    const thisSeason = blockHarvests.filter((h) => {
      const from = start.get(h.block);
      return from ? h.date >= from : diffDays(today, h.date) <= 365;
    });
    return buildFieldLog({ harvests: thisSeason });
  }, [blockHarvests, seasons, today]);
  const fmt = (n: number) => Math.round(n).toLocaleString(locale);
  const kg = season.harvested.weightKg;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('hp.title')}
        description={t('hv2.desc')}
        actions={
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="min-h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {t('hv2.add')}
          </button>
        }
      />

      {blocks.length > 1 && (
        <div role="group" aria-label={t('common.block')} className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap [scrollbar-width:none]">
          {['all', ...blocks].map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={block === b}
              onClick={() => {
                setShown(PAGE);
                setParams({ block: b === 'all' ? null : b });
              }}
              className={`shrink-0 min-h-10 px-3.5 rounded-full border text-sm font-semibold ${
                block === b ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {b === 'all' ? t('common.allBlocks') : t('common.blockN', { n: b })}
            </button>
          ))}
        </div>
      )}

      {msg && (
        <p role="status" className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {msg}
        </p>
      )}

      {/* This season at a glance */}
      <section className="bg-white rounded-xl border border-slate-200 grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100" aria-label={t('hv2.season')}>
        <div className="p-4 space-y-2">
          <p className="text-sm text-slate-600">{t('hv2.picked')}</p>
          <p className="text-3xl font-bold text-slate-900 tabular">
            {fmt(season.harvested.fruits)} <span className="text-base font-semibold text-slate-500">{t('hv2.fruit')}</span>
          </p>
          {kg > 0 && <p className="text-sm text-slate-600 tabular">{kg >= 1000 ? `${(kg / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} t` : `${fmt(kg)} kg`}</p>}
          <GradeBar grades={season.harvested.grades} legend />
        </div>
        <div className="p-4 space-y-2">
          <p className="text-sm text-slate-600">{t('hv2.onTrees')}</p>
          <p className="text-3xl font-bold text-slate-900 tabular">
            {fmt(onTrees)} <span className="text-base font-semibold text-slate-500">{t('hv2.fruit')}</span>
          </p>
          <p className="text-xs text-slate-500">{t('hv2.onTrees.how')}</p>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-sm text-slate-600">{t('hv2.ready')}</p>
          <p className="text-3xl font-bold text-slate-900 tabular">
            {toPick.length} <span className="text-base font-semibold text-slate-500">{t('hv2.trees')}</span>
          </p>
          {toPick.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {toPick.slice(0, 24).map((c) => (
                <li key={c.tree.id}>
                  <Link to={treeUrl(c.tree.id)} className="inline-flex px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 text-xs font-mono font-semibold hover:bg-emerald-100">
                    {c.tree.id}
                  </Link>
                </li>
              ))}
              {toPick.length > 24 && <li className="text-xs text-slate-500 px-1">+{toPick.length - 24}</li>}
            </ul>
          )}
        </div>
      </section>

      {/* Harvest windows per block */}
      <section className="space-y-2" aria-labelledby="hv-win">
        <h2 id="hv-win" className="text-sm font-bold text-slate-900">{t('hp.windows')}</h2>
        {windows.length === 0 ? (
          <p className="p-5 bg-white rounded-xl border border-slate-200 text-sm text-slate-600">{t('hp.windows.none')}</p>
        ) : (
          <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {windows.map((w) => (
              <WindowRow key={w.s.block} {...w} today={today} fmt={fmt} />
            ))}
          </ul>
        )}
      </section>

      {/* The records */}
      <section className="space-y-2.5" aria-labelledby="hv-rec">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="hv-rec" className="text-sm font-bold text-slate-900">
            {t('hv2.records')} <span className="font-medium text-slate-500 tabular">{records.length}</span>
          </h2>
          <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
            {t('hv2.how')}
          </p>
        </div>
        {records.length === 0 ? (
          <p className="p-6 text-center bg-white rounded-xl border border-slate-200 text-sm text-slate-600">{t('hv2.none')}</p>
        ) : (
          <>
            <RecordGrid>
              {records.slice(0, shown).map((e, i) => (
                <RecordCard key={e.key} entry={e} eager={i < 3} />
              ))}
            </RecordGrid>
            {records.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="w-full min-h-11 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('feed.older')}
              </button>
            )}
          </>
        )}
      </section>

      {adding && <HarvestSheet initialBlock={block === 'all' ? undefined : block} onClose={() => setAdding(false)} onSaved={setMsg} />}
    </div>
  );
};

/** One block: its harvest window and where it stands, fruit picked and still on the trees, and its flowering date. */
const WindowRow: React.FC<{
  s: ReturnType<typeof useCrops>['seasons'][number];
  onTrees: number;
  picked: { fruits: number; weightKg: number };
  days: number | null;
  dated: boolean;
  today: string;
  fmt: (n: number) => string;
}> = ({ s, onTrees, picked, days, dated, today, fmt }) => {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inHarvest = dated && days !== null && days <= 0 && diffDays(s.harvestTo!, today) >= 0;
  const ended = dated && diffDays(s.harvestTo!, today) < 0;
  const save = async (value: string) => {
    if (!value) return;
    if (value > today) return setError(t('sched.hv.future'));
    setError(null);
    try {
      await saveHarvestCycle(s.block, value);
      setEditing(false);
    } catch (e) {
      console.error('Flowering date save failed:', e);
      setError(t('sched.hv.saveError'));
    }
  };
  return (
    <li className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="min-w-20 font-semibold text-slate-900">{t('common.blockN', { n: s.block })}</span>
      {dated ? (
        <>
          <span className="text-sm text-slate-800 tabular">
            {s.harvestFrom === s.harvestTo ? formatShortDate(s.harvestFrom!) : `${formatShortDate(s.harvestFrom!)} – ${formatShortDate(s.harvestTo!)}`}
          </span>
          <span
            className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
              inHarvest ? 'bg-emerald-600 text-white' : !ended && days !== null && days <= 14 ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {inHarvest ? t('hp.win.now') : ended ? t('hp.win.ended') : t('sched.hv.in', { n: days ?? 0 })}
          </span>
        </>
      ) : (
        <span className="text-sm text-slate-500">{t('hp.noBloom')}</span>
      )}
      <span className="text-xs text-slate-600 tabular">
        {t('hv2.win.line', { picked: fmt(picked.fruits), left: fmt(onTrees) })}
      </span>
      <span className="ml-auto inline-flex items-center gap-2 text-xs text-slate-500">
        {editing ? (
          <input
            type="date"
            autoFocus
            max={today}
            defaultValue={s.floweredOn}
            onBlur={(e) => (e.target.value && e.target.value !== s.floweredOn ? save(e.target.value) : setEditing(false))}
            onKeyDown={(e) => e.key === 'Enter' && save((e.target as HTMLInputElement).value)}
            aria-label={t('hv2.flowered.edit', { block: s.block })}
            className="h-9 px-2 rounded-lg border border-slate-300 text-sm"
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="min-h-8 inline-flex items-center gap-1 hover:text-slate-800">
            {s.floweredOn ? t('hv2.flowered', { date: formatShortDate(s.floweredOn) }) : t('hv2.flowered.set')}
            <Pencil className="w-3.5 h-3.5" aria-hidden />
          </button>
        )}
      </span>
      {error && <p role="alert" className="w-full text-xs text-rose-700">{error}</p>}
    </li>
  );
};
