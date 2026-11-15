import React from 'react';
import { useT } from '../i18n';
import { fruitsUrl } from '../lib/router';
import { GradeBoard } from './GradeBoard';
import { Link } from './Link';
import { PageHeader } from './PageHeader';

/** The grading board's own page (#/grades). */
export const GradeBoardPage: React.FC = () => {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <PageHeader title={t('gb.title')} description={t('gb.desc')} />
      <GradeBoard />
      <Link to={fruitsUrl()} className="inline-block text-sm font-semibold text-emerald-800 hover:underline">
        {t('gb.toFruits')} →
      </Link>
    </div>
  );
};
