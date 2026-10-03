import React from 'react';
import { navigate } from '../lib/router';

/** Keeps a bug on one page from blanking the whole app. Resets when the page changes. */
export class ErrorBoundary extends React.Component<
  { resetKey: string; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  componentDidCatch(error: Error) {
    console.error('Page crashed:', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="max-w-md mx-auto mt-16 p-6 bg-white rounded-xl border border-slate-200 text-center">
        <h2 className="text-base font-bold text-slate-900">Something went wrong on this page</h2>
        <p className="text-sm text-slate-600 mt-1">The rest of the app is fine. Your data was not changed.</p>
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => window.location.reload()} className="min-h-11 px-4 rounded-xl border border-slate-300 text-sm font-semibold">
            Reload
          </button>
          <button onClick={() => navigate('/', { replace: true })} className="min-h-11 px-4 rounded-xl bg-emerald-600 text-white text-sm font-bold">
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }
}
