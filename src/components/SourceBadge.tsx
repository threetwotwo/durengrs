import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useT } from '../i18n';

/** Small "WhatsApp" tag on a record a worker sent through the WhatsApp Flow (nothing for records typed in the web app). */
export const SourceBadge: React.FC<{ source?: string }> = ({ source }) => {
  const { t } = useT();
  if (source !== 'whatsapp') return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold align-middle">
      <MessageCircle className="w-3 h-3" aria-hidden />
      {t('src.whatsapp')}
    </span>
  );
};
