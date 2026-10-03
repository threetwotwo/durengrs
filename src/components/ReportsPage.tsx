import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFarm, formatDateTime } from '../context/FarmContext';
import { ConditionBadge } from './ConditionBadge';
import { ReportDate } from './ReportDate';
import { PhotoLightbox } from './PhotoLightbox';
import { PageHeader, inputCls } from './PageHeader';
import { navigate, treeUrl, useQueryParams } from '../lib/router';
import { ReportPhoto, TreeReport } from '../types';
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
  User,
  Image as ImageIcon,
  ArrowRight,
  ExternalLink,
  RotateCcw,
  RefreshCw,
  Filter,
} from 'lucide-react';

const ReportThumbnail: React.FC<{
  photo: ReportPhoto;
  idx: number;
  reportDate: any;
  treeId: string;
  onOpen: (url: string, caption: string) => void;
}> = ({ photo, idx, reportDate, treeId, onOpen }) => {
  const [loadFailed, setLoadFailed] = useState(false);
  const src = photo.thumb || photo.url;
  const caption = `Tree ${treeId} · Photo ${idx + 1} (${formatDateTime(reportDate)})`;

  return (
    <div
      onClick={() => onOpen(photo.url, caption)}
      className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer group hover:ring-2 hover:ring-emerald-500 transition-all shadow-xs shrink-0 flex items-center justify-center"
    >
      {!loadFailed ? (
        <img
          src={src}
          alt={`Photo ${idx + 1}`}
          loading="lazy"
          decoding="async"
          width="80"
          height="80"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          onError={() => setLoadFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center text-slate-500 bg-slate-50">
          <ImageIcon className="w-4 h-4 mb-0.5 text-slate-400" />
          <span className="text-xs font-semibold">Photo {idx + 1}</span>
        </div>
      )}

      <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
        <ExternalLink className="w-4 h-4" />
      </div>
    </div>
  );
};

export const ReportsPage: React.FC = () => {
  const { trees, totalReportsCount } = useFarm();
  const [params, setParams] = useQueryParams();

  const [reports, setReports] = useState<TreeReport[]>([]);
  const [pageLimit, setPageLimit] = useState(25);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState<{ url: string; caption?: string } | null>(null);

  // Filters live in the URL: shareable, survive reload, Back works.
  const search = params.get('q') || '';
  const filterBlock = params.get('block') || 'all';
  const filterCondition = params.get('condition') || 'all';
  const onlyChanged = params.get('changed') === '1';

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

  const handleInspectTree = (treeId: string) => navigate(treeUrl(treeId));

  const handleResetFilters = () => setParams({ q: null, block: null, condition: null, changed: null });
  const activeFilterCount = [search, filterBlock !== 'all', filterCondition !== 'all', onlyChanged].filter(Boolean).length;

  const maskPhone = (phone?: string): string => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 4) {
      return `••••${digits.slice(-4)}`;
    }
    return phone;
  };

  return (
    <div className="space-y-4">
      {/* Lightbox Modal */}
      {activePhoto && (
        <PhotoLightbox
          imageUrl={activePhoto.url}
          caption={activePhoto.caption}
          onClose={() => setActivePhoto(null)}
        />
      )}

      <PageHeader
        title="Reports"
        description={`${totalReportsCount} field reports from the WhatsApp bot, newest first.`}
      />

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
            const photos = report.photos || [];
            const tree = trees.find((t) => t.id === report.treeId);
            const workerMasked = maskPhone(report.workerPhone);

            return (
              <div
                key={report.id}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3 hover:border-slate-300 transition-colors"
              >
                {/* 1. Report date on top of the report card */}
                <div className="flex items-center justify-between text-xs text-slate-600 border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1.5 font-sans font-medium text-slate-700">
                    <ReportDate value={report.createdAt} />
                  </div>

                  <div>
                    {report.conditionAfter && (
                      <ConditionBadge condition={report.conditionAfter} size="sm" />
                    )}
                  </div>
                </div>

                {/* 2. Header row: Tree A12 · MK */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <button
                      onClick={() => handleInspectTree(report.treeId)}
                      className="text-sm font-bold font-mono text-emerald-800 hover:text-emerald-600 hover:underline flex items-center gap-1.5"
                    >
                      <span>Tree {report.treeId} · {tree?.variant || 'MK'}</span>
                      <ArrowRight className="w-4 h-4 opacity-60" />
                    </button>
                    {/* 3. Subheading: Block name */}
                    <p className="text-xs text-slate-600 font-medium mt-0.5 font-sans">
                      Block {report.block || tree?.block || '—'}
                    </p>
                  </div>

                  {workerMasked && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 font-mono self-start sm:self-auto">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{workerMasked}</span>
                    </div>
                  )}
                </div>

                {/* Condition changed banner */}
                {report.conditionChanged && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-1.5 text-xs text-amber-900 font-medium">
                    <span>Condition changed:</span>
                    <ConditionBadge condition={report.conditionBefore || 'not_assessed'} size="sm" />
                    <span>→</span>
                    <ConditionBadge condition={report.conditionAfter || 'minor'} size="sm" />
                  </div>
                )}

                {/* Description */}
                {report.description && (
                  <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {report.description}
                  </p>
                )}

                {/* Photo Gallery (fixed w-20 h-20, loading lazy) */}
                {photos.length > 0 && (
                  <div className="pt-1">
                    <span className="text-xs font-semibold text-slate-600 block mb-2">
                      Inspection Photos ({photos.length})
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      {photos.map((photo, pIdx) => (
                        <ReportThumbnail
                          key={pIdx}
                          photo={photo}
                          idx={pIdx}
                          reportDate={report.createdAt}
                          treeId={report.treeId}
                          onOpen={(url, caption) => setActivePhoto({ url, caption })}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
    </div>
  );
};
