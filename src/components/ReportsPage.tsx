import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFarm } from '../context/FarmContext';
import { ReportCard } from './ReportCard';
import { PhotoLightbox, type GalleryItem } from './PhotoLightbox';
import { PageHeader, inputCls } from './PageHeader';
import { ActivityView } from './ActivityView';
import { Link } from './Link';
import { useQueryParams } from '../lib/router';
import { TreeReport } from '../types';
import {
  db,
  parseReportDoc,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
} from 'firebase/firestore';
import {
  ClipboardList,
  Search,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { trees, totalReportsCount } = useFarm();
  const [params, setParams] = useQueryParams();

  const [reports, setReports] = useState<TreeReport[]>([]);
  const [pageLimit, setPageLimit] = useState(25);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<{ items: GalleryItem[]; index: number } | null>(null);

  // Filters live in the URL: shareable, survive reload, Back works.
  const search = params.get('q') || '';
  const filterBlock = params.get('block') || 'all';
  const filterCondition = params.get('condition') || 'all';
  const onlyChanged = params.get('changed') === '1';
  const showActivity = params.get('view') === 'activity';

  const availableBlocks = useMemo(() => {
    const set = new Set<string>();
    trees.forEach((t) => {
      if (t.block) set.add(t.block);
    });
    return Array.from(set).sort();
  }, [trees]);

  // Live feed: new WhatsApp reports appear without a reload. The block filter is applied in the
  // browser because "block + newest first" would need an extra Firestore index.
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(pageLimit + 1));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(parseReportDoc);
        setHasMore(docs.length > pageLimit);
        setReports(docs.slice(0, pageLimit));
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load reports:', err);
        setLoadError('Could not load reports. Check your connection and try again.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [pageLimit]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((rep) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesTree = rep.treeId.toLowerCase().includes(q);
        const matchesPhone = rep.workerPhone && rep.workerPhone.toLowerCase().includes(q);
        const matchesDesc = rep.description && rep.description.toLowerCase().includes(q);
        if (!matchesTree && !matchesPhone && !matchesDesc) return false;
      }

      if (filterCondition !== 'all') {
        const after = (rep.conditionAfter || '').toLowerCase();
        if (filterCondition === 'healthy' && after !== 'healthy') return false;
        if (filterCondition === 'minor' && after !== 'minor' && after !== 'minor_issue') return false;
        if (filterCondition === 'emergency' && after !== 'emergency') return false;
        if (filterCondition === 'not_assessed' && after !== 'not_assessed' && after !== '') return false;
      }

      if (filterBlock !== 'all' && (rep.block || trees.find((x) => x.id === rep.treeId)?.block) !== filterBlock) {
        return false;
      }

      if (onlyChanged && !rep.conditionChanged) {
        return false;
      }

      return true;
    });
  }, [reports, search, filterCondition, filterBlock, onlyChanged, trees]);

  const handleResetFilters = () => setParams({ q: null, block: null, condition: null, changed: null });
  const activeFilterCount = [search, filterBlock !== 'all', filterCondition !== 'all', onlyChanged].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Lightbox Modal */}
      {gallery && <PhotoLightbox items={gallery.items} index={gallery.index} onClose={() => setGallery(null)} />}

      <PageHeader
        title="Reports"
        description={showActivity ? 'Who is reporting, how often, and which blocks are being missed.' : `${totalReportsCount} field reports from the WhatsApp bot, newest first.`}
      />

      <div role="tablist" className="inline-flex p-1 rounded-xl bg-slate-200/70 gap-1">
        {[
          { id: 'feed', label: 'Feed', to: '/reports' },
          { id: 'activity', label: 'Activity', to: '/reports?view=activity' },
        ].map((tab) => {
          const on = (tab.id === 'activity') === showActivity;
          return (
            <Link
              key={tab.id}
              to={tab.to}
              replace
              role="tab"
              aria-selected={on}
              className={`min-h-10 px-4 rounded-lg text-sm font-semibold inline-flex items-center ${on ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {showActivity ? <ActivityView /> : (
      <>
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto] gap-2.5 items-center">
        <div className="relative col-span-2 lg:col-span-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setParams({ q: e.target.value })}
            placeholder="Search tree, phone or text…"
            aria-label="Search reports"
            className={`${inputCls} pl-9`}
          />
        </div>
        <select value={filterBlock} onChange={(e) => setParams({ block: e.target.value })} aria-label="Block" className={inputCls}>
          <option value="all">All blocks</option>
          {availableBlocks.map((b) => (
            <option key={b} value={b}>Block {b}</option>
          ))}
        </select>
        <select value={filterCondition} onChange={(e) => setParams({ condition: e.target.value })} aria-label="Condition" className={inputCls}>
          <option value="all">All conditions</option>
          <option value="healthy">Healthy</option>
          <option value="minor">Minor</option>
          <option value="emergency">Emergency</option>
          <option value="not_assessed">Not assessed</option>
        </select>
        <label className="min-h-11 px-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyChanged}
            onChange={(e) => setParams({ changed: e.target.checked ? '1' : null })}
            className="w-4 h-4 accent-emerald-600"
          />
          Status changed
        </label>
        {activeFilterCount > 0 && (
          <button onClick={handleResetFilters} className="min-h-11 px-3 rounded-lg text-sm font-semibold text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center gap-1.5">
            <RotateCcw className="w-4 h-4" />
            Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {loadError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
          {loadError}
        </div>
      )}

      {/* Reports List */}
      <div className="space-y-3.5">
        {loading && reports.length === 0 ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-36 bg-white rounded-xl border border-slate-200 p-4 animate-pulse" />
            ))}
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <ClipboardList className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No inspection reports match your filter</p>
            <p className="text-xs text-slate-500 mt-1">Try clearing or broadening your search options.</p>
            <button
              onClick={handleResetFilters}
              className="mt-3 px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800"
            >
              Clear filters
            </button>
          </div>
        ) : (
          filteredReports.map((report) => {
            const last4 = (report.workerPhone || '').replace(/\D/g, '').slice(-4);
            return (
              <ReportCard
                key={report.id}
                report={report}
                tree={trees.find((t) => t.id === report.treeId)}
                onOpenPhoto={(items, index) => setGallery({ items, index })}
                workerHref={last4 && search !== last4 ? `/reports?q=${last4}` : undefined}
              />
            );
          })
        )}

        {/* Load More Button (Requirement 7: paginate 25 at a time with "Load more") */}
        {hasMore && (
          <div className="p-4 text-center">
            <button
              onClick={() => setPageLimit((prev) => prev + 25)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-emerald-800 bg-white border border-emerald-300 rounded-xl hover:bg-emerald-50 transition-colors shadow-2xs"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading older reports...</span>
                </>
              ) : (
                <span>Load 25 More Reports</span>
              )}
            </button>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
};
