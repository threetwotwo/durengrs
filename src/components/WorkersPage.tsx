import React from 'react';
import { PageHeader } from './PageHeader';
import { ActivityView } from './ActivityView';
import { useT } from '../i18n';

/** Workers: who reports, how often, which blocks are missed; names for the WhatsApp numbers. */
export const WorkersPage: React.FC = () => {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.workers')} description={t('feed.workers.desc')} />
      <ActivityView />
    </div>
  );
};
