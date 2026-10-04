import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Sheet } from './Sheet';
import { deleteReport } from '../lib/reportAdmin';
import { formatDate, useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import type { TreeReport } from '../types';

/** Confirm, then remove the report, its photo files, and put the tree's condition back if the report changed it. */
export const ReportDeleteSheet: React.FC<{
  report: TreeReport;
  onClose: () => void;
  /** Called once the report document is gone (also when some photo files could not be removed). */
  onDeleted: () => void;
}> = ({ report, onClose, onDeleted }) => {
  const { t } = useT();
  const { refreshReportsCount } = useFarm();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const close = () => {
    if (deleting) return;
    if (warn) onDeleted();
    else onClose();
  };
  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await deleteReport(report.id);
      refreshReportsCount();
      if (res.filesFailed > 0) {
        // The report is gone; some photo files could not be removed (usually Storage rules).
        setWarn(t('rep.del.partial', { n: res.filesFailed, total: res.filesTotal }));
      } else {
        onDeleted();
      }
    } catch (e) {
      console.error('Delete report failed:', e);
      setError(t('rep.del.failed'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet
      title={t('rep.del.title')}
      subtitle={t('rep.del.subtitle', { id: report.treeId, date: formatDate(report.createdAt) })}
      onClose={close}
      footer={
        warn ? (
          <button type="button" onClick={close} className="w-full min-h-11 rounded-xl bg-slate-900 text-white text-sm font-bold">
            {t('common.close')}
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={deleting} className="flex-1 min-h-11 rounded-xl bg-white border border-slate-300 text-slate-800 text-sm font-semibold">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={deleting}
              className="flex-1 min-h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {deleting && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden />}
              {deleting ? t('rep.del.deleting') : t('rep.del.confirm')}
            </button>
          </div>
        )
      }
    >
      {warn ? (
        <p role="status" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">{warn}</p>
      ) : (
        <>
          <p className="text-sm text-slate-700">{t('rep.del.body', { n: report.photos?.length || 0 })}</p>
          {report.conditionChanged && <p className="text-sm text-slate-700">{t('rep.del.revert')}</p>}
          {error && <p role="alert" className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</p>}
        </>
      )}
    </Sheet>
  );
};
