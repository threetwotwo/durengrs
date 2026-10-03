import React from 'react';
import { TreeCondition } from '../types';
import { useT } from '../i18n';
import { Check, AlertTriangle, AlertOctagon, Minus } from 'lucide-react';

interface ConditionBadgeProps {
  condition?: TreeCondition | string | null;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export const ConditionBadge: React.FC<ConditionBadgeProps> = ({
  condition,
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  const { t } = useT();
  const norm = (condition || '').toLowerCase().replace(/[\s_-]+/g, '_');

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-300';
  let label = t('cond.not_assessed');
  let Icon = Minus;

  if (norm === 'healthy') {
    colorClasses = 'bg-emerald-100 text-emerald-800 border-emerald-300';
    label = t('cond.healthy');
    Icon = Check;
  } else if (norm === 'minor' || norm === 'minor_issue') {
    colorClasses = 'bg-amber-100 text-amber-800 border-amber-300';
    label = t('cond.minor');
    Icon = AlertTriangle;
  } else if (norm === 'emergency') {
    colorClasses = 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
    label = t('cond.emergency');
    Icon = AlertOctagon;
  } else {
    // not_assessed or missing
    colorClasses = 'bg-slate-100 text-slate-700 border-slate-300';
    label = t('cond.not_assessed');
    Icon = Minus;
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2',
  }[size];

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  }[size];

  return (
    <span
      className={`inline-flex items-center font-medium rounded-md border shrink-0 ${sizeClasses} ${colorClasses} ${className}`}
    >
      {showIcon && <Icon className={`${iconSizes} shrink-0`} />}
      <span>{label}</span>
    </span>
  );
};
