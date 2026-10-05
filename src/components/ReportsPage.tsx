import React from 'react';
import { PageHeader } from './PageHeader';
import { ActivityView } from './ActivityView';
import { FieldLog } from './FieldLog';
import { ReviewInbox } from './ReviewInbox';
import { Link } from './Link';
import { useQueryParams } from '../lib/router';
import { useT } from '../i18n';

/**
 * Laporan: reports waiting to be checked, then every record from the field in one list (each opens its own page).
 * Aktivitas: who reports, how often, which blocks are missed.
 */
export const ReportsPage: React.FC = () => {
  const { t } = useT();
  const [params] = useQueryParams();
  const showActivity = params.get('view') === 'activity';

  return (
    <div className="space-y-4">
      <PageHeader title={t('rep.title')} description={showActivity ? t('rep.desc.activity') : t('rep.desc.log')} />

      <div role="tablist" className="inline-flex p-1 rounded-xl bg-slate-200/70 gap-1">
        {[
          { id: 'log', label: t('rep.tab.feed'), to: '/reports' },
          { id: 'activity', label: t('rep.tab.activity'), to: '/reports?view=activity' },
        ].map((tab) => {
          const on = tab.id === (showActivity ? 'activity' : 'log');
          return (
            <Link
              key={tab.id}
              to={tab.to}
              replace
              role="tab"
              aria-selected={on}
              className={`min-h-10 px-4 rounded-lg text-sm font-semibold inline-flex items-center ${on ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {showActivity ? (
        <ActivityView />
      ) : (
        <>
          {/* Reports a person hasn't looked at yet, with what the system read from them. */}
          <ReviewInbox />
          <FieldLog />
        </>
      )}
    </div>
  );
};
