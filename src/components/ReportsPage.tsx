import React from 'react';
import { PageHeader } from './PageHeader';
import { ActivityView } from './ActivityView';
import { FieldLog } from './FieldLog';
import { ReviewInbox } from './ReviewInbox';
import { ProblemsView } from './Problems';
import { Link } from './Link';
import { useFarm } from '../context/FarmContext';
import { isDue, isOpen } from '../lib/cases';
import { useQueryParams } from '../lib/router';
import { useT } from '../i18n';

/**
 * Reports, in four views:
 *   To check   reports a person hasn't looked at yet, with what the system read from them
 *   Problems   every problem on a tree, from first sighting to solved (cases)
 *   All        every record from the field in one list (each opens its own page)
 *   Workers    who reports, how often, which blocks are missed
 */
type View = 'check' | 'problems' | 'log' | 'activity';
const LOG_FILTERS = ['q', 'tree', 'topic', 'type', 'block', 'days', 'who', 'src', 'condition', 'changed'];

export const ReportsPage: React.FC = () => {
  const { t } = useT();
  const { cases } = useFarm();
  const [params] = useQueryParams();
  const asked = params.get('view');
  // Older links filter the log without naming a view (e.g. "all from this worker").
  const view: View =
    asked === 'problems' || asked === 'log' || asked === 'activity' ? asked : LOG_FILTERS.some((k) => params.has(k)) ? 'log' : 'check';
  const open = cases.filter(isOpen).length;
  const due = cases.filter((c) => isDue(c)).length;

  const tabs: Array<{ id: View; label: string; to: string; badge?: { n: number; alert?: boolean } }> = [
    { id: 'check', label: t('rep.tab.check'), to: '/reports' },
    { id: 'problems', label: t('rep.tab.problems'), to: '/reports?view=problems', badge: open ? { n: open, alert: due > 0 } : undefined },
    { id: 'log', label: t('rep.tab.feed'), to: '/reports?view=log' },
    { id: 'activity', label: t('rep.tab.activity'), to: '/reports?view=activity' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={t('rep.title')} description={t(`rep.desc.${view}`)} />

      <div role="tablist" className="flex overflow-x-auto -mx-1 px-1">
        <div className="inline-flex p-1 rounded-xl bg-slate-200/70 gap-1">
          {tabs.map((tab) => {
            const on = tab.id === view;
            return (
              <Link
                key={tab.id}
                to={tab.to}
                replace
                role="tab"
                aria-selected={on}
                className={`min-h-10 px-3.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap ${
                  on ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
                {tab.badge && (
                  <span className={`px-1.5 rounded-full text-xs font-bold tabular ${tab.badge.alert ? 'bg-rose-600 text-white' : 'bg-slate-300 text-slate-800'}`}>
                    {tab.badge.n}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {view === 'check' && <ReviewInbox />}
      {view === 'problems' && <ProblemsView />}
      {view === 'log' && <FieldLog />}
      {view === 'activity' && <ActivityView />}
    </div>
  );
};
