import React, { lazy, Suspense, useEffect, useRef } from 'react';
import { FarmProvider, useFarm } from './context/FarmContext';
import { Header, BottomNav } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TAB_TITLES, goBack, navigate, useRoute } from './lib/router';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useT } from './i18n';
import { parseRecordKey } from './lib/fieldLog';

const TreesPage = lazy(() => import('./components/TreesPage').then((m) => ({ default: m.TreesPage })));
const TreeDetailView = lazy(() => import('./components/TreeDetailView').then((m) => ({ default: m.TreeDetailView })));
const VariantsPage = lazy(() => import('./components/VariantsPage').then((m) => ({ default: m.VariantsPage })));
const ReportDetailView = lazy(() => import('./components/ReportDetailView').then((m) => ({ default: m.ReportDetailView })));
const RecordDetailView = lazy(() => import('./components/RecordDetailView').then((m) => ({ default: m.RecordDetailView })));
const ReportsPage = lazy(() => import('./components/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SchedulePage = lazy(() => import('./components/SchedulePage').then((m) => ({ default: m.SchedulePage })));
const HarvestPage = lazy(() => import('./components/HarvestPage').then((m) => ({ default: m.HarvestPage })));
const GuidePage = lazy(() => import('./components/GuidePage').then((m) => ({ default: m.GuidePage })));
const ProblemsPage = lazy(() => import('./components/Problems').then((m) => ({ default: m.ProblemsPage })));
const ProblemPage = lazy(() => import('./components/ProblemPage').then((m) => ({ default: m.ProblemPage })));
const WorkersPage = lazy(() => import('./components/WorkersPage').then((m) => ({ default: m.WorkersPage })));

const AppContent: React.FC = () => {
  const { loading, error, slowConnection } = useFarm();
  const { t, lang } = useT();
  const route = useRoute();
  const mainRef = useRef<HTMLElement>(null);

  // Unknown URL -> dashboard (replace, so Back does not bounce through the bad URL).
  useEffect(() => {
    if (!route.known) navigate('/', { replace: true });
  }, [route.known, route.path]);

  // New page: scroll to top, update the tab title, move keyboard/screen-reader focus to the content.
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${route.treeId ? t('app.title.tree', { id: route.treeId }) : route.reportId ? t('app.title.report') : t(TAB_TITLES[route.tab])} · Cilowong`;
    mainRef.current?.focus({ preventScroll: true });
  }, [route.pageKey, lang]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900 font-sans">
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-white focus:text-slate-900"
      >
        {t('app.skip')}
      </a>
      <Header />

      {error && (
        <div role="alert" className="bg-rose-600 text-white px-4 py-2 text-sm font-medium">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 pb-24 md:pb-5 outline-none"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-2.5" role="status">
            <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin" />
            <p className="text-sm font-medium text-slate-600">{t('app.loading')}</p>
            {slowConnection && <p className="text-sm text-amber-800 max-w-xs text-center">{t('app.slow')}</p>}
          </div>
        ) : (
          <ErrorBoundary key={lang} resetKey={route.pageKey}>
            <Suspense fallback={<div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" />}>
              {route.tab === 'dashboard' && <Dashboard />}
              {route.tab === 'harvest' && <HarvestPage />}
              {route.tab === 'schedule' && <SchedulePage />}
              {route.tab === 'trees' &&
                (route.treeId ? (
                  <TreeDetailView key={route.treeId} treeId={route.treeId} onBack={() => goBack('/trees')} />
                ) : (
                  <TreesPage />
                ))}
              {route.tab === 'variants' && <VariantsPage />}
              {route.tab === 'reports' &&
                (route.reportId ? (
                  parseRecordKey(route.reportId) ? (
                    <RecordDetailView key={route.reportId} {...parseRecordKey(route.reportId)!} />
                  ) : (
                    <ReportDetailView key={route.reportId} reportId={route.reportId} />
                  )
                ) : (
                  <ReportsPage />
                ))}
              {route.tab === 'problems' && (route.caseId ? <ProblemPage key={route.caseId} caseId={route.caseId} /> : <ProblemsPage />)}
              {route.tab === 'workers' && <WorkersPage />}
              {route.tab === 'guide' && <GuidePage />}
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      <BottomNav />

      <footer className="hidden md:block bg-white border-t border-slate-200 py-3 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{t('app.footer')}</div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <FarmProvider>
      <AppContent />
    </FarmProvider>
  );
}
