import React from 'react';
import { Leaf, SprayCan, Scissors, Droplets, Wrench, Check, TriangleAlert, CircleCheck } from 'lucide-react';
import { BlockDue, ScheduleTask, TreatmentType, formatShortDate, monthShort, relativeDue } from '../lib/treatments';
import { BlockSeason, PlanAdvice, TOPIC_BY_ID, pick, planGuidance } from '../lib/guide';
import { useT } from '../i18n';
import { Link } from './Link';

export const TYPE_ICON: Record<TreatmentType, React.ComponentType<{ className?: string }>> = {
  fertilizer: Leaf,
  spray: SprayCan,
  pruning: Scissors,
  irrigation: Droplets,
  other: Wrench,
};

export const DuePill: React.FC<{ task: ScheduleTask }> = ({ task }) => {
  const { t } = useT();
  const cls =
    task.status === 'overdue'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : task.status === 'soon'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';
  const text = task.status === 'upcoming' ? t('sched.due.on', { date: formatShortDate(task.nextDue) }) : relativeDue(task.days);
  return <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${cls}`}>{text}</span>;
};

/** The Guide's verdict on a routine for the blocks' current stage, each line linking to its topic. */
export const PlanAdviceList: React.FC<{ advice: PlanAdvice[]; hideTopic?: boolean }> = ({ advice, hideTopic }) => {
  const { lang } = useT();
  if (!advice.length) return null;
  return (
    <ul className="space-y-1">
      {advice.map((a) => {
        const Icon = a.level === 'warn' ? TriangleAlert : CircleCheck;
        const topic = TOPIC_BY_ID.get(a.topic);
        return (
          <li key={a.text} className={`flex items-start gap-1.5 text-xs ${a.level === 'warn' ? 'text-amber-800' : 'text-emerald-800'}`}>
            <Icon className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>
              {a.text}{' '}
              {topic && !hideTopic && (
                <Link to={`/guide/${a.topic}`} className="font-semibold underline underline-offset-2 whitespace-nowrap">
                  {pick(topic.title, lang)}
                </Link>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

function groupByDue(rows: BlockDue[]) {
  const map = new Map<string, { due: string; days: number; blocks: BlockDue[] }>();
  for (const r of rows) {
    const g = map.get(r.due) || { due: r.due, days: r.days, blocks: [] };
    g.blocks.push(r);
    map.set(r.due, g);
  }
  return Array.from(map.values());
}

export const TaskRow: React.FC<{
  task: ScheduleTask;
  onDone: (task: ScheduleTask) => void;
  compact?: boolean;
  /** Block seasons from the bloom dates; when given, the row shows the Guide's advice for the current stage. */
  seasons?: BlockSeason[];
}> = ({ task, onDone, compact, seasons }) => {
  const { t, lang } = useT();
  const { plan } = task;
  const advice = React.useMemo(
    () => (seasons ? planGuidance(plan, seasons, task.blocks.map((b) => b.block)) : []),
    // lang: advice text is translated when built
    [plan, seasons, task.blocks, lang]
  );
  const Icon = TYPE_ICON[plan.type];
  const detail = [plan.product, plan.dose].filter(Boolean).join(' · ');
  const lastDone = task.blocks.reduce<string | undefined>((m, b) => (b.lastDone && (!m || b.lastDone > m) ? b.lastDone : m), undefined);
  const cadence = [
    t(plan.everyDays === 1 ? 'sched.every.one' : 'sched.every.other', { n: plan.everyDays }),
    plan.startMonth && plan.endMonth ? `${monthShort(plan.startMonth)}–${monthShort(plan.endMonth)}` : null,
    plan.stage || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={`flex items-start gap-3 ${compact ? 'p-3' : 'p-3.5'}`}>
      <span
        className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          task.status === 'overdue' ? 'bg-rose-50 text-rose-600' : task.status === 'soon' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
        }`}
      >
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold text-slate-900">{plan.name}</h3>
          <DuePill task={task} />
        </div>
        {detail && <p className="text-sm text-slate-700">{detail}</p>}
        <p className="text-xs text-slate-600">
          {cadence}
          {' · '}
          {lastDone ? t('sched.lastDone', { date: formatShortDate(lastDone) }) : t('sched.neverDone')}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {groupByDue(task.blocks).map((g) => (
            <span
              key={g.due}
              title={g.blocks.map((b) => `${b.block}: ${b.lastDone ? t('sched.lastDoneLc', { date: formatShortDate(b.lastDone) }) : t('sched.neverDoneLc')}`).join('\n')}
              className={`px-2 py-0.5 rounded-md text-xs font-medium border ${
                g.days < 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : g.days <= 7 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              {g.blocks.length > 1 ? t('common.blocks') : t('common.block')} {g.blocks.map((b) => b.block).join(', ')}
              <span className="opacity-80"> · {g.days < 0 ? t('sched.late', { n: -g.days }) : g.days === 0 ? t('sched.todayLc') : formatShortDate(g.due)}</span>
            </span>
          ))}
        </div>
        {plan.notes && <p className="text-xs text-slate-600 line-clamp-2">{plan.notes}</p>}
        {plan.phiDays && !advice.some((a) => a.topic === 'pests') ? <p className="text-xs text-amber-800">{t('sched.phi.check', { n: plan.phiDays })}</p> : null}
        <PlanAdviceList advice={advice} />
      </div>
      <button
        onClick={() => onDone(task)}
        className="shrink-0 min-h-11 px-3 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white text-sm font-semibold flex items-center gap-1.5 transition-colors"
      >
        <Check className="w-4 h-4" />
        {t('common.done')}
      </button>
    </div>
  );
};
