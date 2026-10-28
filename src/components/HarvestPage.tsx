import React, { useMemo, useState } from 'react';
import { CheckCircle2, MessageCircle, Plus, Tally5 } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { countUrl, fruitsUrl, useQueryParams } from '../lib/router';
import { cropFunnel, fruitOnTree } from '../lib/crop';
import { buildFieldLog } from '../lib/fieldLog';
import { diffDays, todayStr } from '../lib/treatments';
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
 *   2. this season at a glance: fruit picked (with grades), fruit still on the trees
 *   3. the harvest records themselves (a Laporan PANEN as its per-fruit table), and all fruits one click away
 * Block flowering dates are set on the Count page and in the Guide.
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
          <>
          {harvests.some((h) => h.items?.length) && (
            <Link
              to={fruitsUrl({ block: block === 'all' ? null : block })}
              className="min-h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              {t('fr.open')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="min-h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {t('hv2.add')}
          </button>
          </>
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
      <section className="bg-white rounded-xl border border-slate-200 grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100" aria-label={t('hv2.season')}>
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
          <Link to={countUrl(block === 'all' ? undefined : block)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline min-h-9">
            <Tally5 className="w-4 h-4" aria-hidden />
            {t('count.again')}
          </Link>
        </div>
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
