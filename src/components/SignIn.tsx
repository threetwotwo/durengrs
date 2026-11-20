import React, { useState } from 'react';
import { Loader2, LogOut, RefreshCw } from 'lucide-react';
import { useT } from '../i18n';
import { signIn, signOut } from '../lib/auth';
import { LanguageToggle } from './Header';

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useT();
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans flex flex-col">
      <header className="bg-slate-900 text-white">
        <div className="max-w-md mx-auto flex items-center h-14 px-4">
          <span className="font-bold mr-auto">{t('app.footer')}</span>
          <LanguageToggle />
        </div>
      </header>
      <main className="flex-1 flex items-start justify-center px-4 pt-16">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center space-y-4">{children}</div>
      </main>
    </div>
  );
};

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

/** Before anything else: sign in with Google (or wait while the session is checked). */
export const SignInScreen: React.FC<{ loading?: boolean }> = ({ loading }) => {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100" role="status">
        <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin" />
        <span className="sr-only">{t('app.loading')}</span>
      </div>
    );
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e: any) {
      console.error('Sign-in failed:', e);
      setError(e?.code === 'auth/operation-not-allowed' || e?.code === 'auth/configuration-not-found' ? t('auth.notEnabled') : t('auth.failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <h1 className="text-lg font-bold">{t('auth.title')}</h1>
      <p className="text-sm text-slate-600">{t('auth.desc')}</p>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="w-full min-h-12 inline-flex items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 hover:bg-slate-50 active:scale-[0.98] transition disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleMark />}
        {t('auth.google')}
      </button>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </Shell>
  );
};

/** Signed in, but this Google account has no role: who it is, and how to get access. */
export const NoAccessScreen: React.FC<{ email: string }> = ({ email }) => {
  const { t } = useT();
  return (
    <Shell>
      <h1 className="text-lg font-bold">{t('auth.noAccess')}</h1>
      <p className="text-sm text-slate-600">{t('auth.noAccess.desc')}</p>
      <p className="px-3 py-2 rounded-lg bg-slate-100 font-mono text-sm break-all">{email}</p>
      <button type="button" onClick={() => signOut()} className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50">
        <LogOut className="w-4 h-4" />
        {t('auth.other')}
      </button>
    </Shell>
  );
};

/** A small sign-out button for headers. */
export const SignOutButton: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useT();
  return (
    <button type="button" onClick={() => window.confirm(t('auth.signOut.confirm')) && signOut()} aria-label={t('auth.signOut')} title={t('auth.signOut')} className={className || 'p-2 rounded-lg hover:bg-slate-800'}>
      <LogOut className="w-5 h-5" />
    </button>
  );
};
