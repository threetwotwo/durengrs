import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight, ExternalLink, HelpCircle, Plus } from 'lucide-react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatDate, useFarm } from '../context/FarmContext';
import { navigate, useRoute } from '../lib/router';
import { translate, useT } from '../i18n';
import {
  planGuidance,
  STAGES,
  TOPICS,
  TOPIC_BY_ID,
  TopicId,
  isTopicId,
  overloadedTrees,
  pick,
  ripeningRefFor,
  tn,
  treeAgeYears,
} from '../lib/guide';
import { Confidence, TOPIC_CONTENT } from '../lib/guideContent';
import { PLAN_TEMPLATE_BY_ID, typeLabel } from '../lib/treatments';
import { ConditionBadge } from './ConditionBadge';
import { improvingNow } from '../lib/trees';
import { LabResults, WeeklyReview } from './FieldRecords';
import { actualRipening } from '../lib/fieldInsights';
import { Link } from './Link';
import { PlanAdviceList } from './TaskRow';
import { PageHeader, btnPrimary, inputCls } from './PageHeader';
import {
  CheckRow,
  CycleStrip,
  NoDateCard,
  StageGroupCard,
  TOPIC_ICON,
  groupByStage,
  topicUrl,
  useGuideData,
  useTemplateSheet,
} from './GuideWidgets';

/** Research guide: what ideal looks like, where each block is in its cycle, and what this farm is missing. */
export const GuidePage: React.FC = () => {
  const { topicId } = useRoute();
  useEffect(() => {
    if (topicId && !isTopicId(topicId)) navigate('/guide', { replace: true });
  }, [topicId]);
  return isTopicId(topicId) ? <TopicView id={topicId} /> : <Overview />;
};

// ---------- farm notes (guideNotes/{topicId}) ----------

interface GuideNote {
  text: string;
  updatedAt?: unknown;
}

function useGuideNotes() {
  const [notes, setNotes] = useState<Map<string, GuideNote>>(new Map());
  const [loadError, setLoadError] = useState(false);
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'guideNotes'),
        (snap) => {
          setLoadError(false);
          setNotes(new Map(snap.docs.map((d) => [d.id, d.data() as GuideNote])));
        },
        (err) => {
          console.error('Guide notes listener failed:', err);
          setLoadError(true);
        }
      ),
    []
  );
  return { notes, loadError };
}

// ---------- overview ----------

/** A short "ideal conditions" list drawn from the topics: [topic, English label of one of its targets]. */
const GLANCE: Array<[TopicId, string]> = [
  ['site', 'Temperature'],
  ['site', 'Rainfall'],
  ['site', 'Soil pH'],
  ['planting', 'Spacing'],
  ['flowering', 'Flower trigger'],
  ['water', 'Standing water'],
  ['pollination', 'Hand cross-pollination'],
  ['fruit', 'Fruit per cluster'],
  ['fruit', 'Leaves per fruit'],
  ['nutrition', 'Leaf nitrogen (N)'],
  ['nutrition', 'Leaf potassium (K)'],
  ['canopy', 'Lowest branches'],
  ['phytophthora', 'Phosphonate injection, recommended'],
  ['harvest', 'Most reliable signs'],
];

const Overview: React.FC = () => {
  const { t, lang } = useT();
  const { recordsError } = useFarm();
  const { seasons, checks, mentions } = useGuideData();
  const { notes } = useGuideNotes();
  const templates = useTemplateSheet();
  const { groups, noDate } = groupByStage(seasons);
  const open = checks.filter((c) => c.status !== 'ok');
  const ok = checks.filter((c) => c.status === 'ok');
  const count = (s: string) => checks.filter((c) => c.status === s).length;

  return (
    <div className="space-y-6">
      <PageHeader title={t('guide.title')} description={t('guide.desc')} />
      {recordsError && (
        <p role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <HelpCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {recordsError}
        </p>
      )}

      <section className="space-y-3" aria-labelledby="g-season">
        <div>
          <h2 id="g-season" className="text-base font-bold text-slate-900">{t('guide.season.title')}</h2>
          <p className="text-sm text-slate-600">{t('guide.season.help')}</p>
        </div>
        {seasons.length === 0 ? (
          <p className="text-sm text-slate-600">{t('guide.season.empty')}</p>
        ) : (
          <>
            <CycleStrip seasons={seasons} />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <StageGroupCard key={g.stage} group={g} />
              ))}
              {noDate.length > 0 && <NoDateCard blocks={noDate} />}
            </div>
          </>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden" aria-labelledby="g-checks">
        <div className="p-4 border-b border-slate-200">
          <h2 id="g-checks" className="text-base font-bold text-slate-900">{t('guide.checks.title')}</h2>
          <p className="text-sm text-slate-600">{t('guide.checks.help')}</p>
          <p className="text-xs text-slate-500 mt-1 tabular">
            {t('guide.checks.summary', { gap: count('gap'), warn: count('warn'), ok: count('ok') })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">
            <span className="font-semibold">{t('guide.checks.review')}:</span>
            <WeeklyReview compact />
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {open.map((c) => (
            <CheckRow key={c.id} check={c} onTemplate={templates.open} showTopic />
          ))}
        </ul>
        {ok.length > 0 && (
          <details className="border-t border-slate-200">
            <summary className="px-4 py-3 text-sm font-semibold text-slate-700 cursor-pointer min-h-11">
              {t('guide.checks.okList', { n: ok.length })}
            </summary>
            <ul className="divide-y divide-slate-100">
              {ok.map((c) => (
                <CheckRow key={c.id} check={c} onTemplate={templates.open} showTopic />
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="g-topics">
        <h2 id="g-topics" className="text-base font-bold text-slate-900">{t('guide.topics.title')}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((topic) => {
            const Icon = TOPIC_ICON[topic.id];
            const gaps = checks.filter((c) => c.topic === topic.id && c.status !== 'ok').length;
            const mentioned = mentions.get(topic.id)?.length || 0;
            const hasNotes = Boolean(notes.get(topic.id)?.text?.trim());
            return (
              <li key={topic.id}>
                <Link
                  to={topicUrl(topic.id)}
                  className="h-full flex items-start gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-emerald-500 hover:shadow-sm transition-shadow"
                >
                  <Icon className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">{pick(topic.title, lang)}</span>
                    <span className="block text-xs text-slate-600 mt-0.5">{pick(topic.summary, lang)}</span>
                    {(gaps > 0 || mentioned > 0 || hasNotes) && (
                      <span className="flex flex-wrap gap-1.5 mt-2">
                        {gaps > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                            {t('guide.topic.open', { n: gaps })}
                          </span>
                        )}
                        {mentioned > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                            {tn('guide.topic.mentions', mentioned)}
                          </span>
                        )}
                        {hasNotes && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800">
                            {t('guide.notes.title')}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden" aria-labelledby="g-glance">
        <h2 id="g-glance" className="p-4 border-b border-slate-200 text-base font-bold text-slate-900">{t('guide.glance.title')}</h2>
        <dl className="divide-y divide-slate-100">
          {GLANCE.map(([topicId, label]) => {
            const target = TOPIC_CONTENT[topicId].targets.find((x) => x.label.en === label);
            if (!target) return null;
            return (
              <div key={`${topicId}-${label}`} className="grid sm:grid-cols-[minmax(0,14rem)_1fr_auto] gap-x-4 gap-y-0.5 px-4 py-2.5 items-baseline">
                <dt className="text-sm font-semibold text-slate-800">{pick(target.label, lang)}</dt>
                <dd className="text-sm text-slate-700">
                  {pick(target.value, lang)} <ConfidencePill c={target.confidence} />
                </dd>
                <dd>
                  <Link to={topicUrl(topicId)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
                    {pick(TOPIC_BY_ID.get(topicId)!.title, lang)} →
                  </Link>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {templates.sheet}
    </div>
  );
};

// ---------- topic ----------

const confStyle: Record<Confidence, string> = {
  strong: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  study: 'bg-sky-50 text-sky-800 border-sky-200',
  rule: 'bg-slate-50 text-slate-600 border-slate-200',
};

const ConfidencePill: React.FC<{ c: Confidence }> = ({ c }) => {
  const { t } = useT();
  return (
    <span className={`inline-block ml-1 px-1.5 py-px rounded border text-[11px] font-semibold align-middle whitespace-nowrap ${confStyle[c]}`}>
      {t(`guide.conf.${c}`)}
    </span>
  );
};

const card = 'bg-white rounded-xl border border-slate-200 p-4 space-y-3';
const h2 = 'text-sm font-bold text-slate-900';

const TopicView: React.FC<{ id: TopicId }> = ({ id }) => {
  const { t, lang } = useT();
  const { trees, variants, plans, harvests } = useFarm();
  const { seasons, checks, mentions } = useGuideData();
  const templates = useTemplateSheet();
  const topic = TOPIC_BY_ID.get(id)!;
  const content = TOPIC_CONTENT[id];
  const Icon = TOPIC_ICON[id];

  useEffect(() => {
    document.title = `${pick(topic.title, lang)} · ${t('guide.title')} · Cilowong`;
  }, [topic, lang]);

  // Stage actions for this topic, for blocks in an active stage right now.
  const now = useMemo(() => {
    const { groups } = groupByStage(seasons);
    return groups
      .map((g) => ({ g, actions: STAGES[g.stage].actions.filter((a) => a.topic === id) }))
      .filter((x) => x.actions.length > 0);
  }, [seasons, id]);

  const topicChecks = checks.filter((c) => c.topic === id);
  // Active routines that clash with (or fit) the blocks' current stage, for this topic.
  const planAdvice = useMemo(
    () =>
      plans
        .filter((p) => p.active)
        .map((plan) => ({ plan, advice: planGuidance(plan, seasons).filter((a) => a.topic === id && a.level === 'warn') }))
        .filter((x) => x.advice.length > 0),
    [plans, seasons, id, lang]
  );
  const mentioned = mentions.get(id) || [];
  const conditionRank: Record<string, number> = { emergency: 0, minor: 1, not_assessed: 2, healthy: 3 };
  const mentionedSorted = [...mentioned].sort((a, b) => (conditionRank[a.condition] ?? 9) - (conditionRank[b.condition] ?? 9));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link to="/guide" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 min-h-9">
          <ArrowLeft className="w-4 h-4" />
          {t('guide.back')}
        </Link>
        <TopicStepper id={id} />
      </div>
      <TopicStrip id={id} />
      <header className="flex items-start gap-3">
        <Icon className="w-7 h-7 text-emerald-600 mt-0.5 shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">{pick(topic.title, lang)}</h1>
          <p className="text-sm text-slate-600 mt-0.5">{pick(topic.summary, lang)}</p>
        </div>
      </header>

      {now.length > 0 && (
        <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3" aria-labelledby="t-now">
          <h2 id="t-now" className="text-sm font-bold text-emerald-900">{t('guide.now.title')}</h2>
          {now.map(({ g, actions }) => (
            <div key={g.stage}>
              <p className="text-xs font-semibold text-emerald-900">
                {pick(STAGES[g.stage].title, lang)} · {g.blocks.map((b) => t('common.blockN', { n: b.block })).join(', ')}
              </p>
              <ul className="mt-1 space-y-1">
                {actions.map((a, i) => (
                  <li key={i} className="text-sm text-emerald-950">• {pick(a.text, lang)}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-4">
          <section className={card} aria-labelledby="t-targets">
            <h2 id="t-targets" className={h2}>{t('guide.targets')}</h2>
            <dl className="divide-y divide-slate-100 -mx-1">
              {content.targets.map((x, i) => (
                <div key={i} className="grid sm:grid-cols-[minmax(0,12rem)_1fr] gap-x-4 gap-y-0.5 px-1 py-2">
                  <dt className="text-sm font-semibold text-slate-800">{pick(x.label, lang)}</dt>
                  <dd className="text-sm text-slate-700">
                    {pick(x.value, lang)} <ConfidencePill c={x.confidence} />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-slate-500 flex items-start gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 mt-px shrink-0" />
              {t('guide.conf.help')}
            </p>
          </section>

          {content.sections.map((s, i) => (
            <section key={i} className={card}>
              <h2 className={h2}>{pick(s.heading, lang)}</h2>
              <ul className="space-y-2">
                {s.points.map((p, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-slate-800 leading-relaxed">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                    <span>{pick(p, lang)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="lg:col-span-5 space-y-4">
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden" aria-labelledby="t-farm">
            <h2 id="t-farm" className={`${h2} p-4 pb-0`}>{t('guide.farm.title')}</h2>
            {topicChecks.length === 0 && mentioned.length === 0 && planAdvice.length === 0 && id !== 'harvest' && id !== 'fruit' ? (
              <p className="p-4 text-sm text-slate-600">{t('guide.farm.allGood')}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {topicChecks.map((c) => (
                  <CheckRow key={c.id} check={c} onTemplate={templates.open} hideLinkTo={topicUrl(id)} />
                ))}
              </ul>
            )}
            {planAdvice.length > 0 && (
              <div className="p-4 border-t border-slate-100 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('guide.farm.routines')}</h3>
                {planAdvice.map(({ plan, advice }) => (
                  <div key={plan.id}>
                    <Link to="/schedule" className="text-sm font-semibold text-slate-900 hover:text-emerald-700">{plan.name}</Link>
                    <PlanAdviceList advice={advice} hideTopic />
                  </div>
                ))}
              </div>
            )}
            {id === 'harvest' && <VarietyRipening />}
            {id === 'fruit' && <HeavyTrees />}
            {(id === 'nutrition' || id === 'site') && <LabResults />}
            {mentioned.length > 0 && (
              <div className="p-4 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">{t('guide.farm.mentions')}</h3>
                <ul className="space-y-2">
                  {mentionedSorted.slice(0, 12).map((tree) => (
                    <li key={tree.id} className="text-sm">
                      <Link to={`/trees/${encodeURIComponent(tree.id)}`} className="font-semibold font-mono text-slate-900 hover:text-emerald-700">
                        {tree.id}
                      </Link>{' '}
                      <ConditionBadge condition={tree.condition} improving={improvingNow(tree)} size="sm" />
                      <span className="block text-xs text-slate-600 line-clamp-2">{tree.conditionNotes}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link
              to={`/reports?topic=${id}`}
              className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 text-sm font-semibold text-emerald-700 hover:bg-emerald-50/50"
            >
              {t('guide.farm.reports')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </section>

          {content.templates && content.templates.length > 0 && (
            <section className={card} aria-labelledby="t-routines">
              <h2 id="t-routines" className={h2}>{t('guide.routines.title')}</h2>
              <ul className="divide-y divide-slate-100 -my-1">
                {content.templates.map((tplId) => {
                  const tpl = PLAN_TEMPLATE_BY_ID[tplId];
                  if (!tpl) return null;
                  const names = [translate(`sched.tpl.${tplId}.name`, undefined, 'id'), translate(`sched.tpl.${tplId}.name`, undefined, 'en')];
                  const active = plans.some((p) => p.active && names.includes(p.name));
                  return (
                    <li key={tplId} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{tpl.name}</span>
                        <span className="block text-xs text-slate-600">
                          {typeLabel(tpl.type)} · {t('sched.everyShort', { n: tpl.everyDays })}
                        </span>
                      </span>
                      {active ? (
                        <span className="text-xs font-semibold text-emerald-700">{t('guide.routines.active')}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => templates.open(tplId)}
                          className="min-h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1 shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {t('guide.routines.add')}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <FarmNotes topicId={id} questions={content.questions.map((q) => pick(q, lang))} />

          <section className={card} aria-labelledby="t-sources">
            <h2 id="t-sources" className={h2}>{t('guide.sources.title')}</h2>
            <ul className="space-y-1.5">
              {content.sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-emerald-800 hover:text-emerald-900 underline decoration-emerald-300 inline-flex items-start gap-1"
                  >
                    <span>{s.title}</span>
                    <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className={card} aria-labelledby="t-related">
            <h2 id="t-related" className={h2}>{t('guide.related')}</h2>
            <div className="flex flex-wrap gap-2">
              {content.related.map((rid) => {
                const RIcon = TOPIC_ICON[rid];
                return (
                  <Link
                    key={rid}
                    to={topicUrl(rid)}
                    className="min-h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 hover:border-emerald-500 inline-flex items-center gap-1.5"
                  >
                    <RIcon className="w-3.5 h-3.5 text-emerald-600" />
                    {pick(TOPIC_BY_ID.get(rid)!.title, lang)}
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <TopicPrevNext id={id} />

      {templates.sheet}
    </div>
  );

  function VarietyRipening() {
    const real = actualRipening(harvests);
    const used = new Set(trees.map((x) => x.variant));
    const list = variants.filter((v) => used.has(v.code));
    if (list.length === 0) return null;
    return (
      <div className="p-4 border-t border-slate-100">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">{t('guide.varieties.title')}</h3>
        <ul className="space-y-2">
          {list.map((v) => {
            const ref = ripeningRefFor(v);
            const days = Number(v.ripeningDays) > 0 ? Number(v.ripeningDays) : null;
            const outside = ref && days !== null && (days < ref.min - 5 || days > ref.max + 5);
            const realDays = real.get(v.code);
            return (
              <li key={v.code} className="text-sm">
                <Link to={`/variants?edit=${encodeURIComponent(v.code)}`} className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline">
                  {v.name}
                </Link>{' '}
                <span className="text-xs text-slate-500 font-mono">{v.code}</span>
                <span className="block text-xs text-slate-700">
                  {days !== null ? t('guide.varieties.yours', { d: days }) : t('guide.varieties.notSet')}
                  {' · '}
                  {ref ? t('guide.varieties.ref', { min: ref.min, max: ref.max }) : t('guide.varieties.noRef')}
                  {outside && <span className="text-amber-800 font-semibold"> · {t('guide.varieties.outside')}</span>}
                  {realDays && <span className="block font-semibold text-emerald-800">{t('var.real', { n: realDays.days, h: realDays.harvests })}</span>}
                </span>
                {ref && <span className="block text-xs text-slate-500">{pick(ref.note, lang)}</span>}
              </li>
            );
          })}
        </ul>
        <Link to="/variants" className="inline-block mt-2 text-xs font-semibold text-emerald-700">{t('guide.act.openVariants')} →</Link>
      </div>
    );
  }

  function HeavyTrees() {
    const heavy = overloadedTrees(trees);
    if (heavy.length === 0) return null;
    return (
      <div className="p-4 border-t border-slate-100">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">{t('guide.load.title')}</h3>
        <ul className="space-y-1">
          {heavy.slice(0, 12).map(({ tree, max }) => (
            <li key={tree.id} className="text-sm">
              <Link to={`/trees/${encodeURIComponent(tree.id)}`} className="font-semibold font-mono text-slate-900 hover:text-emerald-700">
                {tree.id}
              </Link>{' '}
              <span className="text-xs text-slate-600 tabular">
                {t('guide.load.row', { n: tree.estimatedFruitCount || 0, age: Math.floor(treeAgeYears(tree) || 0), max })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
};

const FarmNotes: React.FC<{ topicId: TopicId; questions: string[] }> = ({ topicId, questions }) => {
  const { t } = useT();
  const { notes, loadError } = useGuideNotes();
  const saved = notes.get(topicId);
  const [text, setText] = useState<string | null>(null); // null = untouched, show what is saved
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const value = text ?? saved?.text ?? '';
  const dirty = text !== null && text !== (saved?.text ?? '');

  const save = async () => {
    setState('saving');
    try {
      await setDoc(doc(db, 'guideNotes', topicId), { text: value.trim(), updatedAt: serverTimestamp() });
      setText(null);
      setState('saved');
    } catch (e) {
      console.error('Saving guide note failed:', e);
      setState('error');
    }
  };

  return (
    <section className={card} aria-labelledby="t-notes">
      <div>
        <h2 id="t-notes" className={`${h2} flex items-center gap-2`}>
          <BookOpen className="w-4 h-4 text-emerald-600" />
          {t('guide.questions.title')}
        </h2>
        <p className="text-xs text-slate-600 mt-0.5">{t('guide.questions.help')}</p>
      </div>
      <ul className="space-y-1">
        {questions.map((q, i) => (
          <li key={i} className="text-sm text-slate-800">• {q}</li>
        ))}
      </ul>
      <div>
        <label htmlFor="gn-text" className="block text-xs font-semibold text-slate-700 mb-1">{t('guide.notes.title')}</label>
        <textarea
          id="gn-text"
          rows={5}
          value={value}
          onChange={(e) => {
            setText(e.target.value);
            setState('idle');
          }}
          placeholder={t('guide.notes.ph')}
          className={`${inputCls} py-2 min-h-28`}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
          <span className="text-xs text-slate-500">
            {loadError
              ? t('guide.notes.loadError')
              : state === 'error'
              ? t('guide.notes.error')
              : state === 'saved' && !dirty
              ? t('guide.notes.saved')
              : saved?.updatedAt
              ? t('guide.notes.updated', { date: formatDate(saved.updatedAt) })
              : ''}
          </span>
          <button type="button" onClick={save} disabled={!dirty || state === 'saving'} className={`${btnPrimary} disabled:opacity-50`}>
            {state === 'saving' ? t('guide.notes.saving') : t('guide.notes.save')}
          </button>
        </div>
      </div>
    </section>
  );
};

// ---------- stepping between topics ----------

/** Previous and next topic in TOPICS order, null at either end. */
function neighbours(id: TopicId) {
  const i = TOPICS.findIndex((x) => x.id === id);
  return { index: i, prev: i > 0 ? TOPICS[i - 1] : null, next: i < TOPICS.length - 1 ? TOPICS[i + 1] : null };
}

const stepBtn =
  'min-h-10 min-w-10 flex items-center justify-center rounded text-slate-600 hover:text-slate-900 hover:bg-white aria-disabled:opacity-30 aria-disabled:pointer-events-none transition-colors';

/** ‹ 3 / 13 › like the tree stepper. Also steps with the ← and → keys (outside text fields). */
const TopicStepper: React.FC<{ id: TopicId }> = ({ id }) => {
  const { t, lang } = useT();
  const { index, prev, next } = neighbours(id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const to = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : null;
      if (!to) return;
      e.preventDefault();
      navigate(topicUrl(to.id), { replace: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next]);

  const btn = (to: (typeof TOPICS)[number] | null, label: string, Icon: typeof ChevronLeft) =>
    to ? (
      <Link to={topicUrl(to.id)} replace className={stepBtn} aria-label={`${label}: ${pick(to.title, lang)}`} title={pick(to.title, lang)}>
        <Icon className="w-4 h-4" />
      </Link>
    ) : (
      <span className={stepBtn} aria-disabled="true" aria-label={label}>
        <Icon className="w-4 h-4" />
      </span>
    );

  return (
    <nav aria-label={t('guide.step.nav')} className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50">
      {btn(prev, t('guide.step.prev'), ChevronLeft)}
      <span className="text-xs font-mono font-medium px-2 text-slate-700 select-none tabular">
        {t('guide.step.of', { n: index + 1, total: TOPICS.length })}
      </span>
      {btn(next, t('guide.step.next'), ChevronRight)}
    </nav>
  );
};

/** Every topic in one scrollable row; the current one is highlighted and scrolled into view. */
const TopicStrip: React.FC<{ id: TopicId }> = ({ id }) => {
  const { t, lang } = useT();
  const current = React.useRef<HTMLLIElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [id]);
  return (
    <nav aria-label={t('guide.step.all')} className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
      <ol className="flex gap-1.5 w-max pb-1">
        {TOPICS.map((x, i) => {
          const on = x.id === id;
          const Icon = TOPIC_ICON[x.id];
          return (
            <li key={x.id} ref={on ? current : undefined}>
              <Link
                to={topicUrl(x.id)}
                replace
                aria-current={on ? 'page' : undefined}
                className={`min-h-9 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap ${
                  on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-500'
                }`}
              >
                <span className={`tabular ${on ? 'text-emerald-100' : 'text-slate-400'}`}>{i + 1}</span>
                <Icon className="w-3.5 h-3.5" />
                {pick(x.title, lang)}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

/** Large previous / next links at the end of a topic, so reading can continue without scrolling back up. */
const TopicPrevNext: React.FC<{ id: TopicId }> = ({ id }) => {
  const { t, lang } = useT();
  const { prev, next } = neighbours(id);
  const card = 'flex-1 min-h-16 p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-500 flex items-center gap-3';
  return (
    <nav aria-label={t('guide.step.nav')} className="flex flex-col sm:flex-row gap-3">
      {prev ? (
        <Link to={topicUrl(prev.id)} replace className={card}>
          <ChevronLeft className="w-5 h-5 text-slate-500 shrink-0" />
          <span className="min-w-0">
            <span className="block text-xs text-slate-500">{t('guide.step.prev')}</span>
            <span className="block text-sm font-bold text-slate-900">{pick(prev.title, lang)}</span>
          </span>
        </Link>
      ) : (
        <span className="hidden sm:block flex-1" />
      )}
      {next ? (
        <Link to={topicUrl(next.id)} replace className={`${card} justify-end text-right`}>
          <span className="min-w-0">
            <span className="block text-xs text-slate-500">{t('guide.step.next')}</span>
            <span className="block text-sm font-bold text-slate-900">{pick(next.title, lang)}</span>
          </span>
          <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" />
        </Link>
      ) : (
        <Link to="/guide" className={`${card} justify-end text-right`}>
          <span className="block text-sm font-bold text-slate-900">{t('guide.back')}</span>
          <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" />
        </Link>
      )}
    </nav>
  );
};
