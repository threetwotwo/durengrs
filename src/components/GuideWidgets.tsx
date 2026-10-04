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
  BlockSeason,
  CheckStatus,
  FarmCheck,
  STAGES,
  STAGE_ORDER,
  StageId,
  TOPICS,
  TOPIC_BY_ID,
  TopicId,
  blockSeasons,
  buildChecks,
  pick,
  topicsForText,
  treeAgeYears,
  typicalMaxFruit,
} from '../lib/guide';
import { PLAN_TEMPLATE_BY_ID, formatShortDate, todayStr } from '../lib/treatments';
import { saveHarvestCycle } from '../lib/insights';
import type { DurianTree, TreeReport } from '../types';
import { Link } from './Link';
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
  const { trees, variants, harvestCycles, plans, scheduleTasks } = useFarm();
  const { lang } = useT();
  const seasons = useMemo(() => blockSeasons(trees, variants, harvestCycles), [trees, variants, harvestCycles]);
  const checks = useMemo(
    () => buildChecks({ trees, variants, plans, scheduleTasks, seasons }),
    // lang: check titles are translated when built
    [trees, variants, plans, scheduleTasks, seasons, lang]
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
}

/** Blocks with a bloom date grouped by stage, in cycle order. Blocks without one are returned separately. */
export function groupByStage(seasons: BlockSeason[]): { groups: StageGroup[]; noDate: BlockSeason[] } {
  const groups = STAGE_ORDER.map((stage) => ({
    stage,
    blocks: seasons.filter((s) => s.floweredOn && s.stage === stage),
  })).filter((g) => g.blocks.length > 0);
  // The active part of the cycle first; blocks waiting for their next bloom last.
  groups.sort((a, b) => (a.stage === 'preflower' ? 1 : 0) - (b.stage === 'preflower' ? 1 : 0));
  return { groups, noDate: seasons.filter((s) => !s.floweredOn) };
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

export const StagePill: React.FC<{ stage: StageId; active?: boolean }> = ({ stage, active = true }) => {
  const { lang } = useT();
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
        active ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'
      }`}
    >
      {pick(STAGES[stage].title, lang)}
    </span>
  );
};

function blockLine(s: BlockSeason, t: (k: string, v?: Record<string, string | number>) => string): string {
  const parts = [t('common.blockN', { n: s.block })];
  if (s.stage === 'preflower' && s.floweredOn) {
    parts.push(t('guide.season.lastBloom', { date: formatShortDate(s.floweredOn) }));
  } else if (s.day !== undefined) {
    parts.push(t('guide.season.day', { n: s.day }));
    if (s.harvestFrom && s.harvestTo && s.stage !== 'recovery') {
      parts.push(
        s.harvestFrom === s.harvestTo
          ? t('guide.season.harvest', { date: formatShortDate(s.harvestFrom) })
          : t('guide.season.harvestRange', { from: formatShortDate(s.harvestFrom), to: formatShortDate(s.harvestTo) })
      );
    }
  }
  return parts.join(' · ');
}

/** One card per stage: which blocks are in it, and what the research says to do now. */
export const StageGroupCard: React.FC<{ group: StageGroup; maxActions?: number }> = ({ group, maxActions }) => {
  const { t, lang } = useT();
  const info = STAGES[group.stage];
  const actions = maxActions ? info.actions.slice(0, maxActions) : info.actions;
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
              {blockLine(b, t)}
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
      <Link to="/schedule?view=harvest" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
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
        const here = seasons.filter((s) => s.floweredOn && s.stage === stage).map((s) => s.block);
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

  const stageInfo = season?.floweredOn ? STAGES[season.stage] : null;

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3" aria-labelledby="tg-h">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tg-h" className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-emerald-600" />
          {t('guide.tree.title')}
        </h2>
        <Link to="/guide" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 min-h-8 flex items-center">
          {t('guide.dash.open')} →
        </Link>
      </div>

      {stageInfo && season ? (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-slate-900">
            {t('guide.tree.stage', { block: tree.block, stage: pick(stageInfo.title, lang) })}{' '}
            <span className="text-xs font-normal text-slate-600 tabular">· {blockLine(season, t).split(' · ').slice(1).join(' · ')}</span>
          </p>
          <ul className="space-y-1">
            {stageInfo.actions.slice(0, 2).map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                <span>
                  {pick(a.text, lang)}{' '}
                  <Link to={topicUrl(a.topic)} className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                    {pick(TOPIC_BY_ID.get(a.topic)!.title, lang)} →
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          {t('guide.tree.noStage', { block: tree.block })}
          <span className="block mt-1.5">
            <BloomQuickSet block={tree.block} />
          </span>
        </p>
      )}

      {topics.length > 0 && (
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

      {heavy && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          {t('guide.tree.load', { n: tree.estimatedFruitCount || 0, max: max ?? 0 })}{' '}
          <Link to={topicUrl('fruit')} className="font-semibold underline">{pick(TOPIC_BY_ID.get('fruit')!.title, lang)}</Link>
        </p>
      )}
      {noSize && <p className="text-xs text-slate-600">{t('guide.tree.missingSize')}</p>}
    </section>
  );
};
