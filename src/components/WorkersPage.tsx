import React, { lazy, Suspense } from 'react';
import { PageHeader } from './PageHeader';
import { ActivityView } from './ActivityView';
import { Link } from './Link';
import { useT } from '../i18n';

const AccessSection = lazy(() => import('./AccessPage').then((m) => ({ default: m.AccessSection })));

/**
 * People (#/workers, #/access): two tabs. Workers: who reports on WhatsApp, how often, which blocks are missed, and
 * names for their numbers. Webapp access (admins): the Google accounts that may open the webapp and their role.
 */
export const WorkersPage: React.FC<{ tab?: 'workers' | 'access' }> = ({ tab = 'workers' }) => {
  const { t } = useT();
  const tabs = [
    ['workers', '/workers', t('people.tab.workers')],
    ['access', '/access', t('people.tab.access')],
  ] as const;
  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.workers')} description={tab === 'workers' ? t('feed.workers.desc') : t('acc.desc')} />
      <nav aria-label={t('nav.workers')} className="inline-flex p-1 rounded-xl bg-slate-200/70">
        {tabs.map(([k, to, label]) => (
          <Link
            key={k}
            to={to}
            replace
            aria-current={tab === k ? 'page' : undefined}
            className={`px-4 min-h-10 inline-flex items-center rounded-lg text-sm font-semibold transition-colors ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === 'workers' ? (
        <ActivityView />
      ) : (
        <Suspense fallback={<div className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />}>
          <AccessSection />
        </Suspense>
      )}
    </div>
  );
};
