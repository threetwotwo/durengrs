import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFarm, formatDateTime } from '../context/FarmContext';
import { ConditionBadge } from './ConditionBadge';
import { PhotoLightbox } from './PhotoLightbox';
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
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import {
  ClipboardList,
  Search,
  User,
  Calendar,
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
  const { trees, variants, setSelectedTreeId, setActiveTab, totalReportsCount, refreshReportsCount } = useFarm();

  const [reports, setReports] = useState<TreeReport[]>([]);
  const [pageLimit, setPageLimit] = useState(25);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterBlock, setFilterBlock] = useState('all');
  const [filterCondition, setFilterCondition] = useState('all');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [activePhoto, setActivePhoto] = useState<{ url: string; caption?: string } | null>(null);

  // Available blocks from trees
  const availableBlocks = useMemo(() => {
    const set = new Set<string>();
    trees.forEach((t) => {
      if (t.block) set.add(t.block);
    });
    return Array.from(set).sort();
  }, [trees]);

  // Load reports 25 at a time (Requirement 7)
  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      let q;
      if (filterBlock !== 'all') {
        q = query(
          collection(db, 'reports'),
          where('block', '==', filterBlock),
          orderBy('createdAt', 'desc'),
          limit(pageLimit + 1)
        );
      } else {
        q = query(
          collection(db, 'reports'),
          orderBy('createdAt', 'desc'),
          limit(pageLimit + 1)
        );
      }

      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(parseReportDoc);

      if (docs.length > pageLimit) {
        setHasMore(true);
        setReports(docs.slice(0, pageLimit));
      } else {
        setHasMore(false);
        setReports(docs);
      }
    } catch (err: any) {
      console.error('Failed to load reports:', err);
      try {
        handleFirestoreError(err, OperationType.LIST, 'reports');
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [filterBlock, pageLimit]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

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

      if (onlyChanged && !rep.conditionChanged) {
        return false;
      }

      return true;
    });
  }, [reports, search, filterCondition, onlyChanged]);

  const handleInspectTree = (treeId: string) => {
    setSelectedTreeId(treeId);
    setActiveTab('trees');
  };

  const handleResetFilters = () => {
    setSearch('');
    setFilterBlock('all');
    setFilterCondition('all');
    setOnlyChanged(false);
    setPageLimit(25);
  };

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

      {/* Header & Controls */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-600" />
            <span>Inspection Reports ({totalReportsCount})</span>
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Paginated feed (25 at a time) of orchard inspection reports
          </p>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tree ID, phone..."
              className="text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none w-48 sm:w-56 placeholder:text-slate-500"
            />
          </div>

          {/* Block filter */}
          <select
            value={filterBlock}
            onChange={(e) => {
              setFilterBlock(e.target.value);
              setPageLimit(25);
            }}
            className="text-xs py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none"
          >
            <option value="all">All Blocks</option>
            {availableBlocks.map((b) => (
              <option key={b} value={b}>
                Block {b}
              </option>
            ))}
          </select>

          {/* Condition filter */}
          <select
            value={filterCondition}
            onChange={(e) => setFilterCondition(e.target.value)}
            className="text-xs py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none"
          >
            <option value="all">All Conditions</option>
            <option value="healthy">Healthy</option>
            <option value="minor">Minor Issue</option>
            <option value="emergency">Emergency</option>
            <option value="not_assessed">Not assessed</option>
          </select>

          {/* Condition changed toggle */}
          <label className="flex items-center gap-1.5 text-xs text-slate-700 font-medium px-2 py-1 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 select-none">
            <input
              type="checkbox"
              checked={onlyChanged}
              onChange={(e) => setOnlyChanged(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
            />
            <span>Status changes only</span>
          </label>

          {(search !== '' || filterBlock !== 'all' || filterCondition !== 'all' || onlyChanged) && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-rose-700 hover:text-rose-800 font-semibold flex items-center gap-1 px-2 py-1 rounded bg-rose-50"
              title="Reset filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

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
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{formatDateTime(report.createdAt)}</span>
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
