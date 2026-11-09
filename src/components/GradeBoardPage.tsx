import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useT } from '../i18n';
import { fruitsUrl, goBack } from '../lib/router';
import { GradeBoard } from './GradeBoard';
import { Link } from './Link';
import { PageHeader } from './PageHeader';

/** The grading board's own page (#/harvest/grades). */
export const GradeBoardPage: React.FC = () => {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <button type="button" onClick={() => goBack('/harvest')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 min-h-9">
        <ArrowLeft className="w-4 h-4" />
        {t('nav.harvest')}
      </button>
      <PageHeader title={t('gb.title')} description={t('gb.desc')} />
      <GradeBoard />
      <Link to={fruitsUrl()} className="inline-block text-sm font-semibold text-emerald-800 hover:underline">
        {t('gb.toFruits')} →
      </Link>
    </div>
  );
};
