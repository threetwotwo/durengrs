import { SourceBadge } from './SourceBadge';
import { PhotoStrip } from './PhotoStrip';
import React, { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, ChevronRight, ClipboardList, ClipboardPlus, Plus, Trash2, Wheat } from 'lucide-react';
import { STAGES, STAGE_ORDER, StageId, TOPIC_BY_ID, pick } from '../lib/guide';
import { useGuideOn } from '../lib/guideMode';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { Sheet, fieldInput, fieldLabel } from './Sheet';
import { Link } from './Link';
import { btnPrimary, btnSecondary } from './PageHeader';
import { CROP_STAGES, CropStage, GRADES, removeCropCount, saveCropCount } from '../lib/fieldData';
import { Funnel, GradeTotals, TreeCrop, topGradeShare } from '../lib/crop';
import { TREE_LIMITS } from '../lib/trees';
import { diffDays, formatShortDate, todayStr } from '../lib/treatments';
import { treeUrl } from '../lib/router';
import type { DurianTree } from '../types';
import { StagePill } from './GuideWidgets';
import { HarvestSheet } from './FieldRecords';
import { useCrops } from './useCrops';

/**
 * Harvest tracking per tree: flower clusters → fruit set → kept after thinning → fruit on the tree → graded harvest.
 * Shared by the Harvest page, the Dashboard and the tree page.
 */

const GRADE_BAR: Record<keyof GradeTotals, string> = {
  extra: 'bg-emerald-600',
  class1: 'bg-teal-400',
  class2: 'bg-amber-400',
  reject: 'bg-rose-500',
  ungraded: 'bg-slate-300',
};
const GRADE_KEYS = [...GRADES, 'ungraded'] as const;

/** Stacked bar of harvested fruit per grade, with an optional legend. */
export const GradeBar: React.FC<{ grades: GradeTotals; legend?: boolean; className?: string }> = ({ grades, legend, className = '' }) => {
  const { t } = useT();
  const total = GRADE_KEYS.reduce((n, g) => n + grades[g], 0);
  if (!total) return null;
  return (
    <div className={className}>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100" role="img" aria-label={GRADE_KEYS.filter((g) => grades[g]).map((g) => `${t(`grade.${g}`)} ${grades[g]}`).join(', ')}>
        {GRADE_KEYS.map((g) => (grades[g] ? <span key={g} className={GRADE_BAR[g]} style={{ width: `${(grades[g] / total) * 100}%` }} /> : null))}
      </div>
      {legend && (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700">
          {GRADE_KEYS.filter((g) => grades[g]).map((g) => (
            <li key={g} className="inline-flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-sm ${GRADE_BAR[g]}`} aria-hidden />
              {t(`grade.${g}.short`)} <span className="font-semibold tabular">{grades[g]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};


/** Flower clusters → fruit set → kept → on the trees → harvested, with the ratio between steps. */
export const FunnelStrip: React.FC<{ funnel: Funnel; compact?: boolean; hints?: Partial<Record<string, React.ReactNode>> }> = ({ funnel, hints = {} }) => {
  const { t } = useT();
  const s = funnel.stages;
  const top = topGradeShare(funnel.harvested.grades);
  const r = funnel.ratios;
  const trees = (n: number) => t('crop.f.trees', { n });
  const steps = [
    { key: 'clusters', value: s.clusters.total, counted: s.clusters.trees > 0, sub: trees(s.clusters.trees) },
    { key: 'set', value: s.set.total, counted: s.set.trees > 0, sub: r.setPerCluster !== null ? t('crop.f.perCluster', { n: r.setPerCluster.toFixed(1) }) : trees(s.set.trees) },
    { key: 'kept', value: s.kept.total, counted: s.kept.trees > 0, sub: r.keptOfSet !== null ? t('crop.f.ofSet', { n: Math.round(r.keptOfSet * 100) }) : trees(s.kept.trees) },
    {
      key: 'onTree',
      value: funnel.remaining,
      counted: s.onTree.trees + s.kept.trees + s.set.trees > 0,
      sub: r.onTreeOfKept !== null ? t('crop.f.ofKept', { n: Math.round(r.onTreeOfKept * 100) }) : trees(s.onTree.trees || s.kept.trees || s.set.trees),
    },
    {
      key: 'harvested',
      value: funnel.harvested.fruits,
      counted: funnel.harvested.entries > 0,
      sub: top !== null ? t('crop.f.topGrade', { n: Math.round(top * 100) }) : funnel.harvested.weightKg ? `${Math.round(funnel.harvested.weightKg)} kg` : t('crop.notPicked'),
    },
  ];
  // One strip, steps divided by lines (not separate cards); steps nobody has counted yet are muted.
  return (
    <ol className="grid grid-cols-2 sm:grid-cols-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
      {steps.map((st, i) => (
        <li
          key={st.key}
          className={`relative p-3 border-slate-200 ${i < 4 ? 'border-b sm:border-b-0 sm:border-r' : 'col-span-2 sm:col-span-1'} ${i % 2 === 0 && i < 4 ? 'border-r' : ''} ${st.counted ? '' : 'bg-slate-50/70'}`}
        >
          <span className="flex items-center gap-1 text-xs font-semibold text-slate-600">
            <span className={`w-4 h-4 rounded-full text-[10px] leading-4 text-center font-bold ${st.counted ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`} aria-hidden>
              {i + 1}
            </span>
            {t(`crop.stage.${st.key}`)}
          </span>
          <span className={`block mt-1 text-2xl font-bold tabular ${st.counted ? 'text-slate-900' : 'text-slate-300'}`}>{st.counted ? st.value.toLocaleString() : '—'}</span>
          <span className="block text-xs text-slate-500 tabular">{st.counted ? st.sub : t('crop.notCounted')}</span>
          {hints[st.key] && <span className="block text-xs">{hints[st.key]}</span>}
          {i === 4 && <GradeBar grades={funnel.harvested.grades} className="mt-1.5" />}
        </li>
      ))}
    </ol>
  );
};

/** Button label for a tree's next step. */
export function nextLabel(crop: TreeCrop, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (!crop.next) return t('crop.count');
  return crop.next.kind === 'harvest' ? t('crop.logHarvest') : t('crop.countStage', { stage: t(`crop.stage.${crop.next.kind}`) });
}

// ---------- count sheet ----------

/**
 * Count one stage on one tree. Opens on the tree's next step; the count also updates the tree record (flower
 * clusters, or the fruit estimate the forecast uses) when it is the newest of its kind.
 */
export const CropCountSheet: React.FC<{
  crops: TreeCrop[];
  treeId?: string;
  stage?: CropStage;
  onClose: () => void;
  onSaved?: (msg: string) => void;
}> = ({ crops, treeId: initialTree, stage: initialStage, onClose, onSaved }) => {
  const { t } = useT();
  const { blocks } = useFarm();
  const start = crops.find((c) => c.tree.id === initialTree);
  const [block, setBlock] = useState(start?.tree.block || blocks[0] || '');
  const [treeId, setTreeId] = useState(start?.tree.id || '');
  const blockCrops = useMemo(
    () =>
      crops
        .filter((c) => c.tree.block === block)
        // Trees with a count due first, then by id.
        .sort((a, b) => Number(!!b.next?.overdue) - Number(!!a.next?.overdue) || a.tree.id.localeCompare(b.tree.id, undefined, { numeric: true })),
    [crops, block]
  );
  const crop = crops.find((c) => c.tree.id === treeId);
  const defaultStage: CropStage = initialStage || (crop?.next && crop.next.kind !== 'harvest' ? crop.next.kind : 'onTree');
  const [stageChoice, setStageChoice] = useState<CropStage | null>(initialStage || null);
  const stage = stageChoice || defaultStage;
  const [seasonChoice, setSeasonChoice] = useState('');
  const seasons = crop?.waves || [];
  const season = seasons.some((w) => w.date === seasonChoice) ? seasonChoice : crop?.next?.season || seasons[0]?.date || '';
  const [count, setCount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [by, setBy] = useState(() => {
    try {
      return localStorage.getItem('cilowong.by') || '';
    } catch {
      return '';
    }
  });
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const limit = stage === 'clusters' ? TREE_LIMITS.floweringClusters.max : TREE_LIMITS.estimatedFruitCount.max;
  const last = crop?.counts[stage];

  const save = async () => {
    const n = Number(count);
    if (!crop) return setError(t('crop.e.tree'));
    if (!season) return setError(t('crop.e.noBloom'));
    if (count.trim() === '' || !Number.isInteger(n) || n < 0 || n > limit) return setError(t('crop.e.count', { max: limit }));
    if (!date || date > todayStr() || date < season) return setError(t('crop.e.date'));
    setSaving(true);
    setError(null);
    try {
      // Keep the tree record current only with the newest count of its kind.
      const tree = crop.tree;
      const fruitDates = (['set', 'kept', 'onTree'] as CropStage[]).map((st) => crop.counts[st]).filter((c) => c && !c.fromTree).map((c) => c!.date);
      const newest = stage === 'clusters' ? !crop.counts.clusters || crop.counts.clusters.fromTree || date >= crop.counts.clusters.date : fruitDates.every((d) => date >= d);
      await saveCropCount(
        { treeId: tree.id, block: tree.block, season, stage, count: n, date, by: by.trim() || undefined, note: note.trim() || undefined },
        newest && seasons.length <= 1
          ? stage === 'clusters'
            ? { field: 'floweringClusters', from: tree.floweringClusters }
            : { field: 'estimatedFruitCount', from: tree.estimatedFruitCount }
          : undefined
      );
      try {
        if (by.trim()) localStorage.setItem('cilowong.by', by.trim());
      } catch {
        /* ignore */
      }
      onSaved?.(t('crop.saved', { id: tree.id, stage: t(`crop.stage.${stage}`), n }));
      onClose();
    } catch (e: any) {
      console.error('Crop count failed:', e);
      setError(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={t('crop.sheet.title')}
      subtitle={crop ? `${t('rep.treeN', { id: crop.tree.id })} · ${t('common.blockN', { n: crop.tree.block })}` : t('crop.sheet.pick')}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p role="alert" className="text-xs text-rose-700 font-medium">{error}</p>}
          <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} w-full min-h-12`}>
            {saving ? t('rec.saving') : t('crop.sheet.save')}
          </button>
        </div>
      }
    >
      {!initialTree && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cc-block" className={fieldLabel}>{t('common.block')}</label>
            <select
              id="cc-block"
              value={block}
              onChange={(e) => {
                setBlock(e.target.value);
                setTreeId('');
              }}
              className={fieldInput}
            >
              {blocks.map((b) => (
                <option key={b} value={b}>{t('common.blockN', { n: b })}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cc-tree" className={fieldLabel}>{t('crop.tree')}</label>
            <select id="cc-tree" value={treeId} onChange={(e) => setTreeId(e.target.value)} className={fieldInput}>
              <option value="">{t('crop.sheet.pickTree')}</option>
              {blockCrops.map((c) => (
                <option key={c.tree.id} value={c.tree.id}>
                  {c.tree.id}
                  {c.next?.overdue && c.next.kind !== 'harvest' ? ` · ${t(`crop.stage.${c.next.kind}`)}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {crop && seasons.length === 0 && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">{t('crop.e.noBloom')}</p>}

      <div>
        <span className={fieldLabel}>{t('crop.sheet.what')}</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('crop.sheet.what')}>
          {CROP_STAGES.map((st) => (
            <button
              key={st}
              type="button"
              role="radio"
              aria-checked={stage === st}
              onClick={() => setStageChoice(st)}
              className={`min-h-12 px-3 rounded-xl border text-sm font-semibold text-left ${stage === st ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
            >
              {t(`crop.stage.${st}`)}
              <span className={`block text-xs font-normal ${stage === st ? 'text-emerald-50' : 'text-slate-500'}`}>{t(`crop.stage.${st}.hint`)}</span>
            </button>
          ))}
        </div>
      </div>

      {seasons.length > 1 && (
        <div>
          <label htmlFor="cc-wave" className={fieldLabel}>{t('crop.sheet.wave')}</label>
          <select id="cc-wave" value={season} onChange={(e) => setSeasonChoice(e.target.value)} className={fieldInput}>
            {seasons.map((w) => (
              <option key={w.date} value={w.date}>
                {formatShortDate(w.date)} · {t('guide.season.day', { n: w.day })}{w.partial ? ` · ${t('guide.wave.branches')}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cc-count" className={fieldLabel}>{t('crop.sheet.count')}</label>
          <input
            id="cc-count"
            type="number"
            inputMode="numeric"
            min={0}
            max={limit}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className={`${fieldInput} text-2xl font-bold tabular`}
            autoFocus
          />
          {last && <p className="mt-1 text-xs text-slate-500">{t('crop.sheet.last', { n: last.count, date: formatShortDate(last.date) })}</p>}
        </div>
        <div>
          <label htmlFor="cc-date" className={fieldLabel}>{t('rec.date')}</label>
          <input id="cc-date" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className={fieldInput} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cc-by" className={fieldLabel}>{t('crop.sheet.by')}</label>
          <input id="cc-by" value={by} onChange={(e) => setBy(e.target.value)} className={fieldInput} />
        </div>
        <div>
          <label htmlFor="cc-note" className={fieldLabel}>{t('common.notes')}</label>
          <input id="cc-note" value={note} onChange={(e) => setNote(e.target.value)} className={fieldInput} />
        </div>
      </div>
    </Sheet>
  );
};

// ---------- tree page ----------

/** One tree's crop this season: each step with its latest count, what to count next, and graded harvest. */
export const TreeCropCard: React.FC<{ tree: DurianTree }> = ({ tree }) => {
  const { t } = useT();
  const { cropCounts } = useFarm();
  const { crops } = useCrops();
  const crop = crops.find((c) => c.tree.id === tree.id);
  const [counting, setCounting] = useState<CropStage | 'next' | null>(null);
  const [harvesting, setHarvesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  if (!crop) return null;
  const waveDates = new Set(crop.waves.map((w) => w.date));
  const history = cropCounts.filter((c) => c.treeId === tree.id && waveDates.has(c.season)).sort((a, b) => b.date.localeCompare(a.date));
  const next = crop.next;

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3" aria-labelledby="crop-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="crop-h" className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Wheat className="w-4 h-4 text-emerald-600" />
          {t('crop.tree.title')}
        </h2>
        <span className="flex flex-wrap gap-1">
          {crop.waves.map((w) => (
            <StagePill key={w.date} stage={w.stage} />
          ))}
        </span>
      </div>

      {crop.waves.length === 0 ? (
        <p className="text-sm text-slate-600">{t('crop.tree.noBloom', { block: tree.block })}</p>
      ) : (
        <>
          {next && (
            <button
              type="button"
              onClick={() => (next.kind === 'harvest' ? setHarvesting(true) : setCounting('next'))}
              className={`${next.overdue || next.kind === 'harvest' ? btnPrimary : btnSecondary} w-full`}
            >
              {next.kind === 'harvest' ? <Wheat className="w-4 h-4" /> : <ClipboardPlus className="w-4 h-4" />}
              {nextLabel(crop, t)}
            </button>
          )}
          <ol className="divide-y divide-slate-100">
            {CROP_STAGES.map((st) => {
              const c = crop.counts[st];
              return (
                <li key={st} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{t(`crop.stage.${st}`)}</span>
                    <span className="block text-xs text-slate-500">
                      {c ? `${formatShortDate(c.date)}${c.fromTree ? ` · ${t('crop.fromTree')}` : ''}` : t('crop.notCounted')}
                    </span>
                  </span>
                  <span className="text-xl font-bold tabular text-slate-900">{c ? c.count : '—'}</span>
                  <button
                    type="button"
                    onClick={() => setCounting(st)}
                    className="min-h-10 min-w-10 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
                    aria-label={t('crop.countStage', { stage: t(`crop.stage.${st}`) })}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
            <li className="py-2 space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{t('crop.stage.harvested')}</span>
                  <span className="block text-xs text-slate-500">
                    {crop.harvested.lastDate ? t('crop.lastPick', { date: formatShortDate(crop.harvested.lastDate) }) : t('crop.notPicked')}
                    {crop.remaining !== undefined ? ` · ${t('crop.remaining', { n: crop.remaining })}` : ''}
                  </span>
                </span>
                <span className="text-xl font-bold tabular text-slate-900">{crop.harvested.fruits || '—'}</span>
                <button
                  type="button"
                  onClick={() => setHarvesting(true)}
                  className="min-h-10 min-w-10 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
                  aria-label={t('crop.logHarvest')}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <GradeBar grades={crop.harvested.grades} legend />
            </li>
          </ol>
          {crop.waves.length > 1 && <p className="text-xs text-slate-600">{t('crop.tree.waves', { n: crop.waves.length })}</p>}
          {msg && <p role="status" className="text-xs text-emerald-700">{msg}</p>}
          {history.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-xs font-semibold text-slate-600 underline min-h-8">
                {showHistory ? t('crop.history.hide') : t('crop.history.show', { n: history.length })}
              </button>
              {showHistory && (
                <ul className="mt-1 divide-y divide-slate-100">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className="min-w-0 flex-1">
                        {formatShortDate(h.date)} · {t(`crop.stage.${h.stage}`)} <span className="font-semibold tabular">{h.count}</span>
                        {h.by ? <span className="text-xs text-slate-500"> · {h.by}</span> : null}{' '}
                        <SourceBadge source={h.source} />
                        {h.note ? <span className="block text-xs text-slate-500">{h.note}</span> : null}
                        <PhotoStrip photos={h.photos} caption={`${h.treeId} · ${t(`crop.stage.${h.stage}`)} · ${formatShortDate(h.date)}`} />
                      </span>
                      <button
                        type="button"
                        onClick={() => window.confirm(t('crop.history.confirm')) && removeCropCount(h.id, h.photos)}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                        aria-label={t('rec.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {counting && (
        <CropCountSheet
          crops={crops}
          treeId={tree.id}
          stage={counting === 'next' ? undefined : counting}
          onClose={() => setCounting(null)}
          onSaved={setMsg}
        />
      )}
      {harvesting && <HarvestSheet initialTree={tree.id} onClose={() => setHarvesting(false)} onSaved={setMsg} />}
    </section>
  );
};

// ---------- grading criteria ----------

/** What each grade means: Codex durian standard (CXS 317-2014) and ASEAN durian standard (Rev. 2012), plus reject. */
export const GradingCriteria: React.FC<{ open?: boolean }> = ({ open }) => {
  const { t } = useT();
  return (
    <details id="grading" open={open} className="bg-white rounded-xl border border-slate-200 p-4 group">
      <summary className="text-sm font-bold text-slate-900 cursor-pointer min-h-8 flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-emerald-600" />
        {t('grade.title')}
      </summary>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {GRADES.map((g) => (
          <li key={g} className="flex gap-3 p-3 rounded-lg border border-slate-200">
            <span className={`w-3 shrink-0 rounded-sm ${GRADE_BAR[g]}`} aria-hidden />
            <span>
              <span className="block text-sm font-bold text-slate-900">{t(`grade.${g}`)}</span>
              <span className="block text-sm text-slate-700">{t(`grade.${g}.criteria`)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">{t('grade.source')}</p>
    </details>
  );
};

/** Link to a tree from the harvest lists. */
export const TreeLink: React.FC<{ id: string }> = ({ id }) => (
  <Link to={treeUrl(id)} className="font-semibold font-mono text-slate-900 hover:text-emerald-700 hover:underline">
    {id}
  </Link>
);

// ---------- Dashboard ----------

/** Which funnel step each stage of the season fills, for the Guide hints. */
const STAGE_STEP: Partial<Record<StageId, string>> = { bloom: 'clusters', set: 'set', thin: 'kept', grow: 'onTree', mature: 'onTree', harvest: 'harvested' };

/** Harvest at a glance on the homepage: one funnel strip, one action row, and (Guide on) what the stages call for. */
export const HarvestHomeCard: React.FC = () => {
  const { t, lang } = useT();
  const guideOn = useGuideOn();
  const { crops, funnel, seasons } = useCrops();
  const [counting, setCounting] = useState(false);
  const [harvesting, setHarvesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const today = todayStr();
  const toPick = crops.filter((c) => c.next?.kind === 'harvest').length;
  const noDate = seasons.filter((s) => !s.floweredOn || s.outdated);
  const windows = seasons
    .filter((s) => s.harvestFrom && s.harvestTo && !s.outdated && diffDays(s.harvestTo, today) >= 0)
    .sort((a, b) => a.harvestFrom!.localeCompare(b.harvestFrom!))
    .slice(0, 3);

  // Guide: blocks per stage right now, the stage's first action, and a hint on the funnel step it fills.
  const now = guideOn
    ? STAGE_ORDER.filter((st) => st !== 'preflower' && st !== 'recovery')
        .map((st) => ({ st, blocks: seasons.filter((s) => s.stages.includes(st) && !s.outdated).map((s) => s.block) }))
        .filter((x) => x.blocks.length)
    : [];
  const hints: Record<string, React.ReactNode> = {};
  for (const n of now) {
    const step = STAGE_STEP[n.st];
    if (step && !hints[step]) hints[step] = <span className="text-emerald-700 font-medium">{t('hh.stageNow', { blocks: n.blocks.join(', ') })}</span>;
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden" aria-labelledby="hh-h">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <h2 id="hh-h" className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Wheat className="w-6 h-6 text-emerald-600" />
          {t('hh.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link to="/harvest" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 min-h-8">
            {t('hh.open')}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <button type="button" onClick={() => setCounting(true)} className={`${btnSecondary} min-h-10 px-3`}>
            <ClipboardPlus className="w-4 h-4 text-emerald-700" />
            {t('crop.count')}
          </button>
          <button type="button" onClick={() => setHarvesting(true)} className={`${btnPrimary} min-h-10 px-3`}>
            <Plus className="w-4 h-4" />
            {t('crop.logHarvest')}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {msg && <p role="status" className="text-sm text-emerald-800">{msg}</p>}
        <FunnelStrip funnel={funnel} hints={hints} />

        {/* One row: what to do now, and when the next harvests are. */}
        <div className="grid sm:grid-cols-3 rounded-xl border border-slate-200 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <Link to="/harvest?todo=1" className="group flex items-center gap-3 p-3 hover:bg-slate-50">
            <span className={`text-2xl font-bold tabular ${funnel.toCount ? 'text-amber-700' : 'text-slate-900'}`}>{funnel.toCount}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{t('hh.toCount')}</span>
              <span className="block text-xs text-slate-500">{funnel.toCount ? t('hh.toCount.short') : t('hp.todo.none')}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
          </Link>
          <Link to="/harvest?todo=1" className="group flex items-center gap-3 p-3 hover:bg-slate-50">
            <span className={`text-2xl font-bold tabular ${toPick ? 'text-emerald-700' : 'text-slate-900'}`}>{toPick}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{t('hh.toPick')}</span>
              <span className="block text-xs text-slate-500">{t('hh.toPick.sub')}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
          </Link>
          <div className="p-3">
            <span className="block text-sm font-semibold text-slate-900">{t('hh.next')}</span>
            {windows.length === 0 ? (
              <span className="block text-xs text-slate-500">{t('hp.windows.none')}</span>
            ) : (
              <ul className="mt-0.5 space-y-0.5">
                {windows.map((s) => {
                  const d = diffDays(s.harvestFrom!, today);
                  return (
                    <li key={s.block} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-800">{t('common.blockN', { n: s.block })}</span>
                      <span className="text-slate-600 tabular">
                        {formatShortDate(s.harvestFrom!)} · <span className={d <= 0 ? 'text-emerald-700 font-semibold' : ''}>{d <= 0 ? t('hp.win.now') : t('sched.hv.in', { n: d })}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {now.length > 0 && (
          <ul className="space-y-1 text-sm" aria-label={t('hh.guideNow')}>
            {now.slice(0, 3).map(({ st, blocks }) => {
              const a = [...STAGES[st].actions].sort((x, y) => (x.task ? 0 : 1) - (y.task ? 0 : 1))[0];
              return (
                <li key={st} className="flex items-start gap-2 text-slate-700">
                  <BookOpen className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                  <span className="line-clamp-2 sm:line-clamp-none">
                    <span className="font-semibold text-slate-900">
                      {pick(STAGES[st].title, lang)} · {blocks.map((b) => t('common.blockN', { n: b })).join(', ')}:
                    </span>{' '}
                    {pick(a.text, lang)}{' '}
                    <Link to={`/guide/${a.topic}`} className="text-xs font-semibold text-emerald-700 whitespace-nowrap hover:underline">
                      {pick(TOPIC_BY_ID.get(a.topic)!.title, lang)} →
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {noDate.length > 0 && (
          <p className="text-xs text-amber-900">
            {t('hh.noDate', { blocks: noDate.map((s) => s.block).join(', ') })}{' '}
            <Link to="/harvest" className="font-semibold underline">{t('hh.setDates')}</Link>
          </p>
        )}
      </div>

      {counting && <CropCountSheet crops={crops} onClose={() => setCounting(false)} onSaved={setMsg} />}
      {harvesting && <HarvestSheet onClose={() => setHarvesting(false)} onSaved={setMsg} />}
    </section>
  );
};
