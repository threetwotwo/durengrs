import React, { lazy, Suspense } from 'react';
import { FarmProvider, useFarm } from './context/FarmContext';
import { Header, BottomNav } from './components/Header';
import { Dashboard } from './components/Dashboard';
const TreesTable = lazy(() => import('./components/TreesTable').then((m) => ({ default: m.TreesTable })));
const TreeDetailView = lazy(() => import('./components/TreeDetailView').then((m) => ({ default: m.TreeDetailView })));
const VariantsPage = lazy(() => import('./components/VariantsPage').then((m) => ({ default: m.VariantsPage })));
const ReportsPage = lazy(() => import('./components/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SchedulePage = lazy(() => import('./components/SchedulePage').then((m) => ({ default: m.SchedulePage })));
import { AlertCircle, RefreshCw } from 'lucide-react';

const AppContent: React.FC = () => {
  const {
    activeTab,
    selectedTreeId,
    setSelectedTreeId,
    loading,
    error,
  } = useFarm();

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900 font-sans">
      {/* Top Header */}
      <Header />

      {/* Error alert if any */}
      {error && (
        <div className="bg-rose-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 pb-24 md:pb-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-2.5">
            <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin" />
            <p className="text-xs font-medium text-slate-500">
              Loading orchard records...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && <Dashboard />}

            <Suspense fallback={<div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" />}>
            {activeTab === 'schedule' && <SchedulePage />}

            {activeTab === 'trees' && (
              <>
                {selectedTreeId ? (
                  <TreeDetailView
                    treeId={selectedTreeId}
                    onBack={() => setSelectedTreeId(null)}
                  />
                ) : (
                  <TreesTable
                    onSelectTree={(id) => setSelectedTreeId(id)}
                  />
                )}
              </>
            )}

            {activeTab === 'variants' && <VariantsPage />}

            {activeTab === 'reports' && <ReportsPage />}
            </Suspense>
          </>
        )}
      </main>

      <BottomNav />

      {/* Sleek Minimal Footer */}
      <footer className="hidden md:block bg-white border-t border-slate-200 py-3.5 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-1 text-xs">
          <span>Cilowong Durian Farm · Admin Management Console</span>
          <span className="text-slate-400">Connected to default Firestore</span>
        </div>
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
