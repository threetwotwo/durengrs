import React from 'react';
import { PageHeader } from './PageHeader';
import { FieldLog } from './FieldLog';
import { useT } from '../i18n';

/** Reports: every record from the field, newest first. Problems and Workers have their own pages. */
export const ReportsPage: React.FC = () => {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <PageHeader title={t('rep.title')} description={t('feed.reports.desc')} />
      <FieldLog />
    </div>
  );
};
