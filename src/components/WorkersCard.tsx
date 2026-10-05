import React, { useState } from 'react';
import { Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { fieldInput, fieldLabel } from './Sheet';
import { btnPrimary } from './PageHeader';
import { checkWorker, maskDigits, removeWorker, saveWorker } from '../lib/workers';

/**
 * Who sends the field records: WhatsApp number -> name. The bot only knows numbers; with a name here, counts, harvests,
 * reports and the activity table show who it was.
 */
export const WorkersCard: React.FC<{ seenPhones?: string[] }> = ({ seenPhones = [] }) => {
  const { t } = useT();
  const { workers } = useFarm();
  const [form, setForm] = useState<{ phone: string; name: string; editing?: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const known = new Set(workers.map((w) => w.phone));
  const unnamed = Array.from(new Set(seenPhones.map((p) => p.replace(/\D/g, '')).filter((p) => p.length >= 8 && !known.has(p))));
  const check = form ? checkWorker(form, workers, form.editing) : null;
  const sorted = [...workers].sort((a, b) => a.name.localeCompare(b.name));

  const open = (v: { phone: string; name: string; editing?: string }) => {
    setForm(v);
    setTouched(false);
    setError(null);
  };
  const save = async () => {
    setTouched(true);
    if (!form || !check || Object.keys(check.errors).length || busy) return;
    setBusy(true);
    try {
      // A changed number is a new document; the old one goes.
      await saveWorker({ phone: check.phone, name: check.name });
      if (form.editing && form.editing !== check.phone) await removeWorker(form.editing);
      setForm(null);
    } catch (e: any) {
      console.error('Saving worker failed:', e);
      setError(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3" aria-labelledby="wk-h">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="wk-h" className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" />
            {t('wk.title')}
          </h2>
          <p className="text-xs text-slate-600">{t('wk.help')}</p>
        </div>
        {!form && (
          <button type="button" onClick={() => open({ phone: '', name: '' })} className="min-h-9 px-3 rounded-lg border border-slate-300 text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5 hover:bg-slate-50">
            <UserPlus className="w-4 h-4" />
            {t('wk.add')}
          </button>
        )}
      </div>

      {form && check && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="wk-name" className={fieldLabel}>{t('wk.name')}</label>
              <input id="wk-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} autoComplete="off" className={fieldInput} />
              {touched && check.errors.name && <p role="alert" className="text-xs text-rose-700 mt-1">{t(check.errors.name)}</p>}
            </div>
            <div>
              <label htmlFor="wk-phone" className={fieldLabel}>{t('wk.phone')}</label>
              <input id="wk-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" autoComplete="off" className={`${fieldInput} font-mono`} />
              {touched && check.errors.phone && <p role="alert" className="text-xs text-rose-700 mt-1">{t(check.errors.phone)}</p>}
            </div>
          </div>
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy} className={`${btnPrimary} min-h-10 disabled:opacity-60`}>{t('wk.save')}</button>
            <button type="button" onClick={() => setForm(null)} className="min-h-10 px-3 text-sm font-semibold text-slate-600">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-600">{t('wk.empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sorted.map((w) => (
            <li key={w.phone} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900 truncate">{w.name}</span>
                <span className="block text-xs text-slate-500 font-mono">{maskDigits(w.phone)}</span>
              </span>
              <button type="button" onClick={() => open({ phone: w.phone, name: w.name, editing: w.phone })} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label={`${t('wk.edit')} ${w.name}`}>
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => window.confirm(t('wk.confirmRemove', { name: w.name })) && removeWorker(w.phone)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label={`${t('wk.remove')} ${w.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {unnamed.length > 0 && (
        <div className="text-xs text-slate-700 space-y-1">
          <p>{t('wk.unnamed')}</p>
          <div className="flex flex-wrap gap-1.5">
            {unnamed.map((p) => (
              <button key={p} type="button" onClick={() => open({ phone: p, name: '' })} className="min-h-8 px-2.5 rounded-full border border-slate-300 bg-white font-mono hover:border-emerald-500">
                {t('wk.nameIt', { phone: maskDigits(p) })}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
