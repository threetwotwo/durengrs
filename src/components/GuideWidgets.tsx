import { SourceBadge } from './SourceBadge';
import { ENGINE_STAGE_WORDS } from '../shared';
import { MissedLink, ViaWhatsApp } from './FieldFirst';
import { PhotoStrip } from './PhotoStrip';
import React, { useMemo, useState } from 'react';
import {
  Apple,
  ArrowRight,
  BookOpen,
  Bug,
  CircleAlert,
  CircleCheck,
  CloudSun,
  Droplets,
  Flower2,
  Leaf,
  Microscope,
  Moon,
  NotebookPen,
  Scissors,
  ShieldAlert,
  TreeDeciduous,
  TriangleAlert,
  Wheat,
} from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import {
  BloomWave,
  BlockSeason,
  CheckStatus,
  FarmCheck,
  STAGES,
  STAGE_ORDER,
  StageId,
  TOPICS,
  TOPIC_BY_ID,
  TopicId,
  buildChecks,
  pick,
  topicsForText,
  treeAgeYears,
  treeStages,
  waveWho,
  BLOOM_PARTS,
  BloomPart,
  typicalMaxFruit,
} from '../lib/guide';
import { PLAN_TEMPLATE_BY_ID, addDays, formatShortDate, todayStr } from '../lib/treatments';
import { saveHarvestCycle } from '../lib/insights';
import { rainSummary } from '../lib/fieldInsights';
import { SeasonTaskChips } from './FieldRecords';
import { addTreeBloom, removeTreeBloom } from '../lib/fieldData';
import type { DurianTree, TreeReport } from '../types';
import { Link } from './Link';
import { useSeasons } from './useSeasons';
import { useGuideOn } from '../lib/guideMode';
import { PlanEditorSheet } from './TreatmentSheets';

export const TOPIC_ICON: Record<TopicId, React.ComponentType<{ className?: string }>> = {
  site: CloudSun,
  planting: TreeDeciduous,
  flowering: Flower2,
  pollination: Moon,
  fruit: Apple,
  water: Droplets,
  nutrition: Leaf,
  canopy: Scissors,
  phytophthora: ShieldAlert,
  diseases: Microscope,
  pests: Bug,
  harvest: Wheat,
  records: NotebookPen,
};

export const topicUrl = (id: TopicId) => `/guide/${id}`;

/** Seasons, checks and note mentions from live farm data. Shared by the Guide, Dashboard and tree pages. */
export function useGuideData() {
  const { trees, variants, harvestCycles, plans, scheduleTasks, harvests, seasonTasksDone, rain, labResults } = useFarm();
  const { lang } = useT();
  const seasons = useSeasons();
  const checks = useMemo(
    () => buildChecks({ trees, variants, plans, scheduleTasks, seasons, harvests, seasonTasksDone, rain, labResults }),
    // lang: check titles are translated when built
    [trees, variants, plans, scheduleTasks, seasons, harvests, seasonTasksDone, rain, labResults, lang]
  );
  const mentions = useMemo(() => {
    const map = new Map<TopicId, DurianTree[]>();
    for (const tree of trees) {
      for (const id of topicsForText(tree.conditionNotes)) {
        const list = map.get(id) || [];
        list.push(tree);
        map.set(id, list);
      }
    }
    return map;
  }, [trees]);
  return { seasons, checks, mentions };
}

export interface StageGroup {
  stage: StageId;
  blocks: BlockSeason[];
  /** Per block, its flowerings that are in this stage (a block can be in several stages at once). */
  waves: Record<string, BloomWave[]>;
}

/** The flowerings of a block that are in a stage. A year-old bloom date with nothing current counts in its own stage. */
export const wavesInStage = (s: BlockSeason, stage: StageId) =>
  s.waves.length ? s.waves.filter((w) => w.stage === stage) : s.floweredOn && s.stage === stage ? [] : null;

/**
 * Blocks with a bloom date grouped by stage, in cycle order; a block whose trees or branches flowered apart is in
 * every stage one of its flowerings is in. Blocks without a date are returned separately.
 */
export function groupByStage(seasons: BlockSeason[]): { groups: StageGroup[]; noDate: BlockSeason[] } {
  const groups = STAGE_ORDER.map((stage) => {
    const blocks = seasons.filter((s) => {
      const w = wavesInStage(s, stage);
      return w !== null && (w.length > 0 || !s.waves.length);
    });
    return { stage, blocks, waves: Object.fromEntries(blocks.map((b) => [b.block, wavesInStage(b, stage) || []])) };
  }).filter((g) => g.blocks.length > 0);
  // The active part of the cycle first; blocks waiting for their next bloom last.
  groups.sort((a, b) => (a.stage === 'preflower' ? 1 : 0) - (b.stage === 'preflower' ? 1 : 0));
  return { groups, noDate: seasons.filter((s) => !s.floweredOn && !s.young) };
}

// ---------- template sheet ----------

/** Opens the routine editor prefilled from a template, from anywhere in the Guide. */
export function useTemplateSheet() {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const template = templateId ? PLAN_TEMPLATE_BY_ID[templateId] : undefined;
  const sheet = template ? <PlanEditorSheet template={template} onClose={() => setTemplateId(null)} /> : null;
  return { open: setTemplateId, sheet };
}

// ---------- small pieces ----------

const statusStyle: Record<CheckStatus, { icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  gap: { icon: CircleAlert, cls: 'text-rose-600' },
  warn: { icon: TriangleAlert, cls: 'text-amber-600' },
  ok: { icon: CircleCheck, cls: 'text-emerald-600' },
};

const smallBtn =
  'min-h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1 border transition-colors';

export const CheckRow: React.FC<{
  check: FarmCheck;
  onTemplate: (id: string) => void;
  showTopic?: boolean;
  /** Drop a link action that points here (e.g. "Read topic" on that topic's own page). */
  hideLinkTo?: string;
}> = ({ check: raw, onTemplate, showTopic, hideLinkTo }) => {
  const { t, lang } = useT();
  const check = raw.action?.kind === 'link' && raw.action.to === hideLinkTo ? { ...raw, action: undefined } : raw;
  const { icon: Icon, cls } = statusStyle[check.status];
  const topic = TOPIC_BY_ID.get(check.topic);
  return (
    <li className="flex items-start gap-3 p-3.5">
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${cls}`} aria-label={t(`guide.status.${check.status}`)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{check.title}</p>
        {check.detail && <p className="text-xs text-slate-600 mt-0.5">{check.detail}</p>}
        {(check.action || (showTopic && topic)) && (
          <div className="flex flex-wrap gap-2 mt-2">
            {check.action?.kind === 'link' && (
              <Link to={check.action.to} className={`${smallBtn} bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700`}>
                {check.action.label}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            {check.action?.kind === 'template' && (
              <button
                type="button"
                onClick={() => check.action?.kind === 'template' && onTemplate(check.action.templateId)}
                className={`${smallBtn} bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700`}
              >
                {check.action.label}
              </button>
            )}
            {showTopic && topic && !(check.action?.kind === 'link' && check.action.to === topicUrl(topic.id)) && (
              <Link to={topicUrl(topic.id)} className={`${smallBtn} bg-white border-slate-300 text-slate-700 hover:bg-slate-50`}>
                <BookOpen className="w-3.5 h-3.5" />
                {pick(topic.title, lang)}
              </Link>
            )}
          </div>
        )}
      </div>
    </li>
  );
};

/** `farm`: the stage in the farm's words (as observed stages are shown), for an expected stage next to an observed one. */
export const StagePill: React.FC<{ stage: StageId; active?: boolean; farm?: boolean }> = ({ stage, active = true, farm }) => {
  const { lang } = useT();
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
        active ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'
      }`}
    >
      {farm ? ENGINE_STAGE_WORDS[stage][lang] : pick(STAGES[stage].title, lang)}
    </span>
  );
};

/**
 * "Block A · day 62 · harvest 01 Dec - 31 Dec". With `waves` (the block's flowerings in one stage) it describes only
 * those: "Block A · day 20 · A3, A4 (some branches) · harvest ...".
 */
export function blockLine(s: BlockSeason, t: (k: string, v?: Record<string, string | number>) => string, waves?: BloomWave[]): string {
  const parts = [t('common.blockN', { n: s.block })];
  const ws = waves && waves.length ? waves : null;
  const stage = ws ? ws[0].stage : s.stage;
  if (stage === 'preflower' && s.floweredOn) {
    parts.push(t('guide.season.lastBloom', { date: formatShortDate(ws ? ws[ws.length - 1].date : s.floweredOn) }));
    return parts.join(' · ');
  }
  const dMax = ws ? ws[0].day : s.dayMax ?? s.day;
  const dMin = ws ? ws[ws.length - 1].day : s.dayMin ?? s.day;
  if (dMax === undefined || dMin === undefined) return parts.join(' · ');
  parts.push(dMax === dMin ? t('guide.season.day', { n: dMax }) : t('guide.season.days', { a: dMin, b: dMax }));
  if (ws) {
    const who = ws.map((w) => waveWho(w, s, t)).filter(Boolean);
    if (who.length) parts.push(who.join('; '));
  } else if (s.waves.length > 1) {
    parts.push(t('guide.wave.count', { n: s.waves.length }));
  }
  const from = ws ? addDays(ws[0].date, s.ripeMin) : s.harvestFrom;
  const to = ws ? addDays(ws[ws.length - 1].date, s.ripeMax) : s.harvestTo;
  if (from && to && stage !== 'recovery') {
    parts.push(
      from === to ? t('guide.season.harvest', { date: formatShortDate(from) }) : t('guide.season.harvestRange', { from: formatShortDate(from), to: formatShortDate(to) })
    );
  }
  return parts.join(' · ');
}

/** One card per stage: which blocks are in it, and what the research says to do now. */
export const StageGroupCard: React.FC<{ group: StageGroup; maxActions?: number }> = ({ group, maxActions }) => {
  const { t, lang } = useT();
  const { rain } = useFarm();
  const info = STAGES[group.stage];
  // Doable season tasks first, so the Done chips are visible even when the list is shortened.
  const ordered = [...info.actions].sort((a, b) => (a.task ? 0 : 1) - (b.task ? 0 : 1));
  const actions = maxActions ? ordered.slice(0, maxActions) : ordered;
  const dry = group.stage === 'preflower' ? rainSummary(rain) : null;
  const assumed = group.blocks.some((b) => b.ripeningAssumed) && group.stage !== 'preflower';
  return (
    <article className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold text-slate-900">{pick(info.title, lang)}</h3>
        <span className="text-xs text-slate-500">{pick(info.when, lang)}</span>
      </header>
      <ul className="space-y-1">
        {group.blocks.map((b) => (
          <li key={b.block} className="text-xs text-slate-700 tabular space-y-1">
            <Link to={`/trees?block=${encodeURIComponent(b.block)}`} className="font-semibold text-slate-900 hover:text-emerald-700">
              {blockLine(b, t, group.waves[b.block])}
            </Link>
            {/* Waiting for flowers: one tap starts the new season for this block. */}
            {group.stage === 'preflower' && (
              <div>
                <BloomQuickSet block={b.block} current={b.floweredOn} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {assumed && <p className="text-xs text-amber-800">{t('guide.season.assumed', { d: group.blocks[0].ripeMin })}</p>}
      {dry?.dry && dry.drySince && dry.expectedBloom && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2">
          {t('rec.rain.dry', { since: formatShortDate(dry.drySince), bloom: formatShortDate(dry.expectedBloom) })}
        </p>
      )}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">{t('guide.season.now')}</h4>
        <ul className="space-y-1.5">
          {actions.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-800">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
              <span>
                {pick(a.text, lang)}{' '}
                <Link to={topicUrl(a.topic)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
                  {pick(TOPIC_BY_ID.get(a.topic)!.title, lang)} →
                </Link>
                {a.task && <SeasonTaskChips task={a.task} seasons={group.blocks} />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
};

/**
 * One tap to record that flowers opened in a block (the date every Guide stage counts from), right where the
 * Guide asks for it. "Other date" for a past day; Undo restores the previous value.
 */
export const BloomQuickSet: React.FC<{ block: string; current?: string }> = ({ block, current }) => {
  const { t } = useT();
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; msg?: string; prev?: string | null }>({ kind: 'idle' });

  const save = async (value: string | null, prev: string | null) => {
    setState({ kind: 'saving' });
    try {
      await saveHarvestCycle(block, value);
      setPicking(false);
      setState(value ? { kind: 'saved', prev } : { kind: 'idle' });
    } catch (e: any) {
      console.error('Saving bloom date failed:', e);
      setState({ kind: 'error', msg: e?.code === 'permission-denied' ? t('sched.hv.rulesHint') : t('sched.hv.saveError') });
    }
  };

  if (state.kind === 'saved') {
    return (
      <span role="status" className="inline-flex flex-wrap items-center gap-2 text-xs text-emerald-800">
        <span>{t('guide.bloom.saved', { block })}</span>
        <button type="button" onClick={() => save(state.prev ?? null, null)} className="font-semibold underline min-h-8">
          {t('sched.undo')}
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {!picking ? (
        <>
          <button
            type="button"
            disabled={state.kind === 'saving'}
            onClick={() => save(todayStr(), current ?? null)}
            className={`${smallBtn} bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}
          >
            <Flower2 className="w-3.5 h-3.5" />
            {t('guide.bloom.today', { block })}
          </button>
          <button type="button" onClick={() => setPicking(true)} className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline min-h-8">
            {t('guide.bloom.other')}
          </button>
        </>
      ) : (
        <>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            aria-label={t('guide.bloom.dateLabel', { block })}
            className="min-h-9 px-2 rounded-lg border border-slate-300 text-sm"
          />
          <button
            type="button"
            disabled={!date || date > todayStr() || state.kind === 'saving'}
            onClick={() => save(date, current ?? null)}
            className={`${smallBtn} bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}
          >
            {t('guide.bloom.save')}
          </button>
          <button type="button" onClick={() => setPicking(false)} className="text-xs text-slate-600 underline min-h-8">
            {t('common.cancel')}
          </button>
        </>
      )}
      {state.kind === 'error' && <span role="alert" className="basis-full text-xs text-rose-700">{state.msg}</span>}
    </span>
  );
};

export const NoDateCard: React.FC<{ blocks: BlockSeason[] }> = ({ blocks }) => {
  const { t } = useT();
  return (
    <article className="bg-white rounded-xl border border-dashed border-slate-300 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{t('guide.season.noDate.title')}</h3>
        <p className="text-sm text-slate-700 mt-0.5">{t('guide.season.noDate.body')}</p>
      </div>
      <ul className="space-y-2">
        {blocks.map((b) => (
          <li key={b.block}>
            <BloomQuickSet block={b.block} />
          </li>
        ))}
      </ul>
      <Link to="/harvest" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
        {t('guide.bloom.allInSchedule')}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </article>
  );
};

/** The whole cycle in order, with the blocks currently in each stage. Teaches the cycle at a glance. */
export const CycleStrip: React.FC<{ seasons: BlockSeason[] }> = ({ seasons }) => {
  const { t, lang } = useT();
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label={t('guide.season.cycle')}>
      {STAGE_ORDER.map((stage, i) => {
        const here = seasons.filter((s) => (s.waves.length ? s.stages.includes(stage) : s.floweredOn && s.stage === stage)).map((s) => s.block);
        const on = here.length > 0;
        return (
          <li
            key={stage}
            className={`px-2.5 py-1.5 rounded-lg border text-xs ${
              on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-500'
            }`}
          >
            <span className="font-semibold">
              {i + 1}. {pick(STAGES[stage].title, lang)}
            </span>
            {on && <span className="block tabular">{here.map((b) => t('common.blockN', { n: b })).join(', ')}</span>}
          </li>
        );
      })}
    </ol>
  );
};

// ---------- Dashboard ----------

export const DashboardSeasonCard: React.FC = () => {
  const { t } = useT();
  const { seasons, checks } = useGuideData();
  const { groups, noDate } = groupByStage(seasons);
  const gaps = checks.filter((c) => c.status === 'gap').length;
  if (seasons.length === 0) return null;

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden" aria-labelledby="season-h">
      <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <h2 id="season-h" className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-emerald-600" />
          {t('guide.dash.title')}
        </h2>
        <div className="flex items-center gap-3">
          {gaps > 0 && (
            <Link to="/guide" className="text-xs font-semibold text-rose-700 hover:text-rose-800">
              {t('guide.dash.gaps', { n: gaps })}
            </Link>
          )}
          <Link to="/guide" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 min-h-8">
            {t('guide.dash.open')}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
      <div className="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* Blocks without a bloom date come first: one tap there unlocks everything else. */}
        {noDate.length > 0 && <NoDateCard blocks={noDate} />}
        {groups.slice(0, noDate.length > 0 ? 2 : 3).map((g) => (
          <StageGroupCard key={g.stage} group={g} maxActions={2} />
        ))}
      </div>
    </section>
  );
};

// ---------- Tree page ----------

export const TreeGuideSection: React.FC<{ tree: DurianTree; reports: TreeReport[] }> = ({ tree, reports }) => {
  const { t, lang } = useT();
  const { seasons } = useGuideData();
  const { treeBlooms, harvestCycles } = useFarm();
  // Guide off: only the flowering records (data), without the action plans and topic links.
  const guideOn = useGuideOn();
  const season = seasons.find((s) => s.block === tree.block);
  const topics = useMemo(
    () => topicsForText(tree.conditionNotes, ...reports.slice(0, 5).map((r) => r.description)),
    [tree.conditionNotes, reports]
  );
  const age = treeAgeYears(tree);
  const max = age === null ? null : typicalMaxFruit(age);
  const heavy = max !== null && (tree.estimatedFruitCount || 0) > max;
  const noSize = tree.trunkSize === undefined || tree.canopySize === undefined || tree.canopySize === '';
  if (!tree.block) return null;

  // This tree's own flowerings (or the block date it follows), each with its stage.
  const tws = treeStages(tree, season, treeBlooms, harvestCycles);
  const stagesHere = STAGE_ORDER.filter((st) => tws.some((w) => w.stage === st));

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3" aria-labelledby="tg-h">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tg-h" className="text-sm font-bold text-slate-900 flex items-center gap-2">
          {guideOn ? <BookOpen className="w-4 h-4 text-emerald-600" /> : <Flower2 className="w-4 h-4 text-emerald-600" />}
          {guideOn ? t('guide.tree.title') : t('guide.tree.blooms')}
        </h2>
        {guideOn && (
          <Link to="/guide" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 min-h-8 flex items-center">
            {t('guide.dash.open')} →
          </Link>
        )}
      </div>

      {tws.length > 0 && season ? (
        <div className="space-y-3">
          <ul className="space-y-1.5" aria-label={t('guide.tree.blooms')}>
            {tws.map((w) => (
              <li key={(w.id || 'block') + w.date} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <StagePill stage={w.stage} />
                <span className="text-slate-800 tabular">
                  {formatShortDate(w.date)} · {t('guide.season.day', { n: w.day })}
                </span>
                <span className="text-xs text-slate-600">
                  {w.fromBlock ? t('guide.tree.fromBlock', { block: tree.block }) : t(`guide.part.${w.part}`)}
                </span>
                {w.id && <SourceBadge source={treeBlooms.find((b) => b.id === w.id)?.source} />}
                {w.id && <span className="basis-full"><PhotoStrip photos={treeBlooms.find((b) => b.id === w.id)?.photos} caption={`${tree.id} · ${formatShortDate(w.date)}`} /></span>}
                {w.id && (
                  <button
                    type="button"
                    onClick={() => window.confirm(t('guide.tree.removeBloom', { date: formatShortDate(w.date) })) && removeTreeBloom(w.id!, treeBlooms.find((b) => b.id === w.id)?.photos)}
                    className="text-xs font-semibold text-slate-500 hover:text-rose-700 underline min-h-8"
                  >
                    {t('guide.tree.remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {guideOn && tws.length > 1 && <p className="text-xs text-slate-600">{t('guide.tree.mixed')}</p>}
          {guideOn && stagesHere.map((st) => (
            <div key={st} className="space-y-1">
              {stagesHere.length > 1 && <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{pick(STAGES[st].title, lang)}</p>}
              <ul className="space-y-1">
                {[...STAGES[st].actions].sort((a, b) => (a.task ? 0 : 1) - (b.task ? 0 : 1)).slice(0, 2).map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                    <span>
                      {pick(a.text, lang)}{' '}
                      <Link to={topicUrl(a.topic)} className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                        {pick(TOPIC_BY_ID.get(a.topic)!.title, lang)} →
                      </Link>
                      {a.task && <SeasonTaskChips task={a.task} seasons={[season]} />}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          {t('guide.tree.noStage', { block: tree.block })}
          <span className="block mt-1.5">
            <BloomQuickSet block={tree.block} />
          </span>
        </p>
      )}
      <TreeBloomRecorder tree={tree} />

      {guideOn && topics.length > 0 && (
        <div>
          <p className="text-xs text-slate-600 mb-1.5">{t('guide.tree.topics')}</p>
          <div className="flex flex-wrap gap-2">
            {topics.map((id) => {
              const Icon = TOPIC_ICON[id];
              return (
                <Link
                  key={id}
                  to={topicUrl(id)}
                  className={`${smallBtn} bg-white border-slate-300 text-slate-800 hover:border-emerald-500 hover:bg-emerald-50/50`}
                >
                  <Icon className="w-3.5 h-3.5 text-emerald-600" />
                  {pick(TOPICS.find((x) => x.id === id)!.title, lang)}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {guideOn && heavy && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          {t('guide.tree.load', { n: tree.estimatedFruitCount || 0, max: max ?? 0 })}{' '}
          <Link to={topicUrl('fruit')} className="font-semibold underline">{pick(TOPIC_BY_ID.get('fruit')!.title, lang)}</Link>
        </p>
      )}
      {guideOn && noSize && <p className="text-xs text-slate-600">{t('guide.tree.missingSize')}</p>}
    </section>
  );
};

/**
 * Record that this tree flowered apart from its block: the whole tree (its own date replaces the block's for it) or
 * only some branches (an extra wave; the rest of the tree keeps following the block).
 */
export const TreeBloomRecorder: React.FC<{ tree: DurianTree }> = ({ tree }) => {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [part, setPart] = useState<BloomPart>('some');
  const [date, setDate] = useState(todayStr());
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; id?: string; msg?: string }>({ kind: 'idle' });

  const save = async () => {
    if (!date || date > todayStr()) return setState({ kind: 'error', msg: t('sched.hv.future') });
    setState({ kind: 'saving' });
    try {
      const r = await addTreeBloom({ treeId: tree.id, block: tree.block, date, part });
      setOpen(false);
      // Undo only removes a record made here, never one a worker already sent.
      setState(r.created ? { kind: 'saved', id: r.id } : { kind: 'saved', msg: t('guide.tree.bloomExists') });
    } catch (e: any) {
      console.error('Saving tree bloom failed:', e);
      setState({ kind: 'error', msg: e?.code === 'permission-denied' ? t('err.rulesRecords') : t('sched.hv.saveError') });
    }
  };

  if (!open) {
    return (
      <div className="pt-1 border-t border-slate-100 space-y-1">
        {state.kind === 'saved' && (
          <p role="status" className="text-xs text-emerald-800 flex flex-wrap items-center gap-2">
            {state.msg || t('guide.tree.bloomSaved')}
            {state.id && (
              <button type="button" onClick={() => state.id && removeTreeBloom(state.id).then(() => setState({ kind: 'idle' }))} className="font-semibold underline min-h-8">
                {t('sched.undo')}
              </button>
            )}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <ViaWhatsApp text={t('ff.viaTree')} />
          <MissedLink onClick={() => setOpen(true)} label={t('ff.missedBloom')} />
        </div>
      </div>
    );
  }
  return (
    <div className="pt-3 border-t border-slate-100 space-y-2.5">
      <p className="text-sm font-semibold text-slate-900">{t('guide.tree.addBloomTitle', { id: tree.id })}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('guide.tree.part')}>
        {BLOOM_PARTS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={part === p}
            onClick={() => setPart(p)}
            className={`min-h-9 px-3 rounded-full border text-xs font-semibold ${part === p ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}
          >
            {t(`guide.part.${p}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-600">{t(part === 'whole' ? 'guide.tree.partWholeHelp' : 'guide.tree.partSomeHelp', { block: tree.block })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          aria-label={t('guide.tree.bloomDate')}
          className="min-h-9 px-2 rounded-lg border border-slate-300 text-sm"
        />
        <button
          type="button"
          onClick={save}
          disabled={state.kind === 'saving'}
          className={`${smallBtn} bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}
        >
          {t('guide.tree.saveBloom')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-slate-600 underline min-h-8">
          {t('common.cancel')}
        </button>
      </div>
      {state.kind === 'error' && <p role="alert" className="text-xs text-rose-700">{state.msg}</p>}
    </div>
  );
};
