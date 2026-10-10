import React from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import { useT } from '../i18n';
import type { TreeCrop } from '../lib/crop';

/**
 * Field records (counts, harvests, flowerings, season tasks, rain) are sent by the workers on WhatsApp. The webapp shows
 * them; entering one here is only for a record that could not be sent from the field.
 */
export const ViaWhatsApp: React.FC<{ className?: string; text?: string }> = ({ className = '', text }) => {
  const { t } = useT();
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-slate-600 ${className}`}>
      <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden />
      {text || t('ff.via')}
    </span>
  );
};

/** Small, secondary way in to add a record by hand. */
export const MissedLink: React.FC<{ onClick: () => void; label: string; className?: string; plain?: boolean }> = ({ onClick, label, className = '', plain }) => (
  <button
    type="button"
    onClick={onClick}
    className={`min-h-8 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline underline-offset-2 ${className}`}
  >
    {!plain && <Plus className="w-3.5 h-3.5" aria-hidden />}
    {label}
  </button>
);

/** What a tree needs next, as information (the worker sends it on WhatsApp). */
export const DuePill: React.FC<{ crop: TreeCrop; className?: string }> = ({ crop, className = '' }) => {
  const { t } = useT();
  const harvest = crop.next?.kind === 'harvest';
  const overdue = !!crop.next?.overdue;
  return (
    <span
      className={`inline-flex items-center gap-1.5 min-h-8 px-2.5 rounded-full border text-xs font-semibold whitespace-nowrap ${className} ${
        harvest ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : overdue ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-slate-300 text-slate-700'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${harvest ? 'bg-emerald-500' : overdue ? 'bg-amber-500' : 'bg-slate-400'}`} aria-hidden />
      {harvest ? t('ff.due.harvest') : crop.next ? t('ff.due.count', { stage: t(`crop.stage.${crop.next.kind}`) }) : ''}
    </span>
  );
};
