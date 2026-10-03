import React, { useMemo, useState } from 'react';
import { AlertTriangle, Wheat, CalendarCheck, History, ListChecks, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import {
  PLAN_TEMPLATES,
  PlanTemplate,
  ScheduleTask,
  TREATMENT_TYPE_LABELS,
  TreatmentPlan,
  formatShortDate,
  removePlan,
  removeTreatment,
  setPlanActive,
} from '../lib/treatments';
import { TaskRow, TYPE_ICON } from './TaskRow';
import { HarvestView } from './HarvestView';
import { PageHeader, btnPrimary } from './PageHeader';
import {
  MarkDoneSheet,
  PlanEditorSheet,
  UndoToast,
  undoLogged,
  useUndoToast,
} from './TreatmentSheets';

type View = 'agenda' | 'routines' | 'harvest' | 'history';

export const SchedulePage: React.FC = () => {
  const { plans, treatments, scheduleTasks, scheduleError } = useFarm();
  const [view, setView] = useState<View>('agenda');
  const [doneTask, setDoneTask] = useState<ScheduleTask | null>(null);
  const [editor, setEditor] = useState<{ plan?: TreatmentPlan; template?: PlanTemplate } | null>(null);
  const { toast, show, clear } = useUndoToast();

  const groups = useMemo(() => {
    const overdue = scheduleTasks.filter((t) => t.status === 'overdue');
    const week = scheduleTasks.filter((t) => t.status === 'soon');
    const later = scheduleTasks.filter((t) => t.status === 'upcoming' && t.days <= 60);
    return { overdue, week, later };
  }, [scheduleTasks]);

  const Section: React.FC<{ title: string; tone?: string; tasks: ScheduleTask[] }> = ({ title, tone, tasks }) =>
    tasks.length === 0 ? null : (
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h2 className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wide border-b border-slate-200 ${tone || 'text-slate-600 bg-slate-50'}`}>
          {title} ({tasks.length})
        </h2>
        <div className="divide-y divide-slate-100">
          {tasks.map((t) => (
            <TaskRow key={t.plan.id} task={t} onDone={setDoneTask} />
          ))}
        </div>
      </section>
    );

  const tabs: Array<{ id: View; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'agenda', label: 'Agenda', icon: CalendarCheck },
    { id: 'routines', label: `Routines (${plans.length})`, icon: ListChecks },
    { id: 'harvest', label: 'Harvest', icon: Wheat },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Schedule"
        description="Routine work, when each is due, and when to expect harvest."
        actions={
          <button onClick={() => setEditor({})} className={btnPrimary}>
            <Plus className="w-4 h-4" />
            New routine
          </button>
        }
      />

      {scheduleError && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{scheduleError}</span>
        </div>
      )}

      <div role="tablist" className="flex max-w-full overflow-x-auto p-1 rounded-xl bg-slate-200/70 gap-1 w-fit">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={view === t.id}
              onClick={() => setView(t.id)}
              className={`min-h-10 px-3.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                view === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {view === 'agenda' && (
        <div className="space-y-4">
          {plans.length === 0 ? (
            <TemplateStarter onPick={(template) => setEditor({ template })} />
          ) : scheduleTasks.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-300 text-sm text-slate-600">
              No active routines. Turn one on in Routines.
            </div>
          ) : (
            <>
              <Section title="Overdue" tone="text-rose-700 bg-rose-50" tasks={groups.overdue} />
              <Section title="Next 7 days" tone="text-amber-800 bg-amber-50" tasks={groups.week} />
              <Section title="Later (next 60 days)" tasks={groups.later} />
              {groups.overdue.length + groups.week.length + groups.later.length === 0 && (
                <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-sm text-slate-600">
                  Nothing due in the next 60 days.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {view === 'routines' && (
        <div className="space-y-3">
          {plans.length === 0 ? (
            <TemplateStarter onPick={(template) => setEditor({ template })} />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {plans.map((p) => {
                const Icon = TYPE_ICON[p.type];
                return (
                  <div key={p.id} className={`flex items-center gap-3 p-3.5 ${p.active ? '' : 'opacity-60'}`}>
                    <Icon className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-900">{p.name}</h3>
                      <p className="text-xs text-slate-600">
                        {TREATMENT_TYPE_LABELS[p.type]} · every {p.everyDays}d ·{' '}
                        {p.allBlocks ? 'all blocks' : `Block ${p.blocks.join(', ')}`}
                        {p.startMonth && p.endMonth ? ` · months ${p.startMonth}-${p.endMonth}` : ''}
                        {p.active ? '' : ' · paused'}
                      </p>
                    </div>
                    <button onClick={() => setPlanActive(p.id, !p.active)} className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100" aria-label={p.active ? 'Pause routine' : 'Resume routine'}>
                      {p.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setEditor({ plan: p })} className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Edit routine">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => window.confirm(`Delete "${p.name}"? Past history is kept.`) && removePlan(p.id)}
                      className="p-2.5 rounded-lg text-rose-600 hover:bg-rose-50"
                      aria-label="Delete routine"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <details className="bg-white rounded-xl border border-slate-200 p-4">
            <summary className="text-sm font-semibold text-slate-800 cursor-pointer min-h-8">Add from a template</summary>
            <TemplateStarter compact onPick={(template) => setEditor({ template })} />
          </details>
        </div>
      )}

      {view === 'harvest' && <HarvestView />}

      {view === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {treatments.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-600">Nothing logged yet. Use "Done" on the agenda.</p>
          ) : (
            treatments.slice(0, 100).map((t) => {
              const Icon = TYPE_ICON[t.type] || TYPE_ICON.other;
              return (
                <div key={t.id} className="flex items-start gap-3 p-3.5">
                  <Icon className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-900">{t.planName}</h3>
                    <p className="text-xs text-slate-600">
                      {formatShortDate(t.date)} · Block {t.blocks.join(', ')}
                      {t.product ? ` · ${t.product}` : ''}
                      {t.dose ? ` · ${t.dose}` : ''}
                      {t.doneBy ? ` · by ${t.doneBy}` : ''}
                    </p>
                    {t.notes && <p className="text-xs text-slate-500 mt-0.5">{t.notes}</p>}
                  </div>
                  <button
                    onClick={() => window.confirm('Remove this entry?') && removeTreatment(t.id)}
                    className="p-2.5 rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label="Remove entry"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {doneTask && (
        <MarkDoneSheet
          task={doneTask}
          onClose={() => setDoneTask(null)}
          onSaved={(id, message) => show({ message, undo: () => undoLogged(id) })}
        />
      )}
      {editor && <PlanEditorSheet plan={editor.plan} template={editor.template} onClose={() => setEditor(null)} />}
      <UndoToast toast={toast} onClear={clear} />
    </div>
  );
};

const TemplateStarter: React.FC<{ onPick: (t: PlanTemplate) => void; compact?: boolean }> = ({ onPick, compact }) => (
  <div className={compact ? 'pt-3' : 'p-5 bg-white rounded-xl border border-dashed border-slate-300'}>
    {!compact && (
      <>
        <h2 className="text-base font-bold text-slate-900">Start with a routine</h2>
        <p className="text-sm text-slate-600 mt-1 mb-3">
          Pick a template and adjust it. These come from a published durian calendar (Malaysia), so check the months against
          your own seasons and your agronomist's advice.
        </p>
      </>
    )}
    <div className="grid sm:grid-cols-2 gap-2">
      {PLAN_TEMPLATES.map((t) => {
        const Icon = TYPE_ICON[t.type];
        return (
          <button
            key={t.name}
            onClick={() => onPick(t)}
            className="text-left flex items-start gap-3 p-3 min-h-14 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40"
          >
            <Icon className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <span>
              <span className="block text-sm font-semibold text-slate-900">{t.name}</span>
              <span className="block text-xs text-slate-600">
                every {t.everyDays}d{t.stage ? ` · ${t.stage}` : ''}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  </div>
);
