import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Sheet, fieldInput, fieldLabel } from './Sheet';
import { btnSecondary } from './PageHeader';
import { useT } from '../i18n';
import { archiveTree } from '../lib/fieldData';
import { ARCHIVE_NOTE_MAX, ARCHIVE_REASONS, checkArchive } from '../lib/trees';

/** Takes a tree out of service without deleting anything: history stays and the ID is never given to another plant. */
export const ArchiveTreeSheet: React.FC<{ treeId: string; onClose: () => void; onDone: () => void }> = ({ treeId, onClose, onDone }) => {
  const { t } = useT();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { errors } = checkArchive({ reason, note });
  const show = (k: 'reason' | 'note') => (touched && errors[k] ? <p role="alert" className="text-xs text-rose-700 mt-1">{t(errors[k]!.key, errors[k]!.vars)}</p> : null);

  const save = async () => {
    setTouched(true);
    if (busy || Object.keys(errors).length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await archiveTree(treeId, reason, note);
      if (r === 'missing') {
        setError(t('tree.arch.e.missing', { id: treeId }));
        setBusy(false);
        return;
      }
      onDone(); // 'already' (archived on another device a moment ago) is the same end state
    } catch (e: any) {
      console.error('Archive tree failed:', e);
      setError(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={t('tree.arch.title', { id: treeId })}
      subtitle={t('tree.arch.subtitle')}
      onClose={() => !busy && onClose()}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={`${btnSecondary} flex-1`}>{t('common.cancel')}</button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex-1 min-h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {busy && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden />}
            {busy ? t('tree.arch.saving') : t('tree.arch.confirm')}
          </button>
        </div>
      }
    >
      <ul className="text-sm text-slate-700 space-y-1.5 list-disc pl-5">
        <li>{t('tree.arch.keeps')}</li>
        <li>{t('tree.arch.reserved', { id: treeId })}</li>
        <li>{t('tree.arch.whatsapp')}</li>
        <li>{t('tree.arch.undo')}</li>
      </ul>

      <fieldset>
        <legend className={fieldLabel}>{t('tree.arch.reason')}</legend>
        <div className="space-y-1.5">
          {ARCHIVE_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 min-h-10 text-sm text-slate-800">
              <input type="radio" name="arch-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="w-4 h-4" />
              {t(`tree.arch.r.${r}`)}
            </label>
          ))}
        </div>
        {show('reason')}
      </fieldset>

      <div>
        <label htmlFor="arch-note" className={fieldLabel}>{t(reason === 'other' ? 'tree.arch.noteRequired' : 'tree.arch.note')}</label>
        <textarea id="arch-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={ARCHIVE_NOTE_MAX + 50} className={fieldInput} />
        {show('note')}
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </Sheet>
  );
};
