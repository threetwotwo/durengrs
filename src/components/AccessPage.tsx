import React, { useEffect, useState } from 'react';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ROLES, type Role, auth, emailKey } from '../lib/auth';
import { useT } from '../i18n';
import { PageHeader, btnPrimary, inputCls } from './PageHeader';

interface Member {
  id: string;
  role: Role;
  name?: string;
  addedAt?: string;
  addedBy?: string;
}

/**
 * #/access (admins): the Google accounts that may use the webapp and their role. Admin: everything. Shop team: only
 * the QC page. Taking someone off (or changing their role) applies at once on their device. Workers need nothing
 * here: they report on WhatsApp.
 */
export const AccessPage: React.FC = () => {
  const { t } = useT();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('shop');
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const me = emailKey(auth.currentUser?.email || '');
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'users'),
        (s) => setMembers(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as Member).filter((m) => ROLES.includes(m.role)).sort((a, b) => a.role.localeCompare(b.role) || a.id.localeCompare(b.id))),
        (e) => setError(e.message)
      ),
    []
  );
  const key = emailKey(email);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key);
  const add = async () => {
    if (!valid) return;
    setState('saving');
    try {
      await setDoc(doc(db, 'users', key), { role, ...(name.trim() ? { name: name.trim().slice(0, 60) } : {}), addedAt: new Date().toISOString(), addedBy: me });
      setEmail('');
      setName('');
      setState('idle');
    } catch (e) {
      console.error('Adding a user failed:', e);
      setState('error');
    }
  };
  const change = async (m: Member, r: Role) => {
    if (m.id === me && r !== 'admin' && !window.confirm(t('acc.demoteSelf'))) return;
    await updateDoc(doc(db, 'users', m.id), { role: r }).catch((e) => setError(e.message));
  };
  const remove = async (m: Member) => {
    if (!window.confirm(t('acc.remove.confirm', { email: m.id }))) return;
    await deleteDoc(doc(db, 'users', m.id)).catch((e) => setError(e.message));
  };
  const admins = (members || []).filter((m) => m.role === 'admin').length;
  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title={t('acc.title')} description={t('acc.desc')} />
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">{t('acc.add')}</h2>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('acc.email.ph')} aria-label={t('acc.email')} className={inputCls} autoComplete="off" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('acc.name.ph')} aria-label={t('acc.name')} className={inputCls} />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label={t('acc.role')} className={`${inputCls} sm:!w-36`}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{t(`acc.role.${r}`)}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500">{t(`acc.role.${role}.desc`)}</p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={add} disabled={!valid || state === 'saving'} className={btnPrimary}>
            {state === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {t('acc.addBtn')}
          </button>
          {members?.some((m) => m.id === key) && <span className="text-xs text-amber-700">{t('acc.exists')}</span>}
          {state === 'error' && <span role="alert" className="text-xs text-rose-700">{t('fr.saveError')}</span>}
        </div>
      </section>
      <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {(members || []).map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900 truncate">
                {m.name || m.id}
                {m.id === me && <span className="ml-2 text-xs font-normal text-slate-500">{t('acc.you')}</span>}
              </span>
              {m.name && <span className="block text-xs text-slate-500 truncate">{m.id}</span>}
            </span>
            <select
              value={m.role}
              onChange={(e) => change(m, e.target.value as Role)}
              disabled={m.id === me && admins <= 1}
              aria-label={t('acc.role')}
              className={`${inputCls} !w-36`}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{t(`acc.role.${r}`)}</option>
              ))}
            </select>
            <button type="button" onClick={() => remove(m)} disabled={m.id === me} aria-label={t('acc.remove', { email: m.id })} className="p-2 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 disabled:invisible">
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
