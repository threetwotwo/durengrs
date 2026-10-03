import React, { useState, useMemo, useEffect } from 'react';
import { useFarm, formatDateWithAgo, formatDateTime, formatTimeAgo, normalizeTimestamp } from '../context/FarmContext';
import { ConditionBadge } from './ConditionBadge';
import { PhotoLightbox } from './PhotoLightbox';
import { ReportPhoto, TreeCondition, TreeReport, DurianTree } from '../types';
import {
  db,
  parseReportDoc,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import {
  TreeDeciduous,
  Check,
  AlertTriangle,
  AlertOctagon,
  Minus,
  Clock,
  ArrowRight,
  ArrowUpDown,
  User,
  Calendar,
  Layers,
  Image as ImageIcon,
  ExternalLink,
} from 'lucide-react';

const DashboardReportThumb: React.FC<{
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
      onClick={(e) => {
        e.stopPropagation();
        onOpen(photo.url, caption);
      }}
      className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer group hover:ring-2 hover:ring-emerald-500 transition-all shadow-2xs shrink-0 flex items-center justify-center"
    >
      {!loadFailed ? (
        <img
          src={src}
          alt={`Photo ${idx + 1}`}
          loading="lazy"
          decoding="async"
          width="56"
          height="56"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          onError={() => setLoadFailed(true)}
        />
      ) : (
        <ImageIcon className="w-4 h-4 text-slate-400" />
      )}
      <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
        <ExternalLink className="w-3.5 h-3.5" />
      </div>
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const {
    trees,
    variants,
    totalFruits,
    totalReportsCount,
    loading: treesLoading,
    setActiveTab,
    setSelectedTreeId,
    setFilterBlock,
    setFilterCondition,
    setQuickFilter,
  } = useFarm();

  const [latestReports, setLatestReports] = useState<TreeReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [blockSortField, setBlockSortField] = useState<'block' | 'healthy' | 'minor' | 'emergency' | 'not_assessed' | 'total' | 'fruits'>('block');
  const [blockSortAsc, setBlockSortAsc] = useState(true);
  const [activePhoto, setActivePhoto] = useState<{ url: string; caption?: string } | null>(null);

  // Targeted live subscription for ONLY the latest 8 reports
  useEffect(() => {
    setReportsLoading(true);
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(8));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map(parseReportDoc);
        setLatestReports(list);
        setReportsLoading(false);
      },
      (err) => {
        console.error('Failed to stream latest reports:', err);
        setReportsLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'reports');
        } catch {}
      }
    );

    return () => unsubscribe();
  }, []);

  // Condition counts including Not assessed and No report in 7+ days
  const counts = useMemo(() => {
    let healthy = 0;
    let minor = 0;
    let emergency = 0;
    let notAssessed = 0;
    let noReport7d = 0;

    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

    trees.forEach((t) => {
      if (t.condition === 'healthy') healthy++;
      else if (t.condition === 'minor') minor++;
      else if (t.condition === 'emergency') emergency++;
      else notAssessed++;

      const repTime = normalizeTimestamp(t.lastReportAt);
      if (!repTime || repTime < sevenDaysAgoMs) {
        noReport7d++;
      }
    });

    const total = trees.length;
    return {
      healthy,
      minor,
      emergency,
      notAssessed,
      noReport7d,
      total,
      healthyPct: total ? Math.round((healthy / total) * 100) : 0,
      minorPct: total ? Math.round((minor / total) * 100) : 0,
      emergencyPct: total ? Math.round((emergency / total) * 100) : 0,
      notAssessedPct: total ? Math.round((notAssessed / total) * 100) : 0,
    };
  }, [trees]);

  // Needs Attention trees: emergency first, then minor
  const attentionTrees = useMemo(() => {
    const emergency = trees.filter((t) => t.condition === 'emergency');
    const minor = trees.filter((t) => t.condition === 'minor');
    return [...emergency, ...minor];
  }, [trees]);

  // Per-block breakdown, sorted A to E by default
  const blockStats = useMemo(() => {
    const map = new Map<
      string,
      { block: string; healthy: number; minor: number; emergency: number; not_assessed: number; total: number; fruits: number }
    >();

    trees.forEach((t) => {
      const b = t.block || 'Unassigned';
      if (!map.has(b)) {
        map.set(b, { block: b, healthy: 0, minor: 0, emergency: 0, not_assessed: 0, total: 0, fruits: 0 });
      }
      const entry = map.get(b)!;
      entry.total++;
      entry.fruits += t.estimatedFruitCount || 0;
      if (t.condition === 'healthy') entry.healthy++;
      else if (t.condition === 'minor') entry.minor++;
      else if (t.condition === 'emergency') entry.emergency++;
      else entry.not_assessed++;
    });

    const list = Array.from(map.values());

    list.sort((a, b) => {
      const valA = a[blockSortField];
      const valB = b[blockSortField];
      if (typeof valA === 'string') {
        return blockSortAsc
          ? valA.localeCompare(valB as string)
          : (valB as string).localeCompare(valA);
      }
      return blockSortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    return list;
  }, [trees, blockSortField, blockSortAsc]);

  const handleBlockSort = (field: 'block' | 'healthy' | 'minor' | 'emergency' | 'not_assessed' | 'total' | 'fruits') => {
    if (blockSortField === field) {
      setBlockSortAsc(!blockSortAsc);
    } else {
      setBlockSortField(field);
      setBlockSortAsc(field === 'block' ? true : false);
    }
  };

  const handleInspectTree = (treeId: string) => {
    setSelectedTreeId(treeId);
  };

  const handleConditionTileClick = (cond: string) => {
    setFilterCondition(cond);
    setQuickFilter(cond);
    setActiveTab('trees');
  };

  const handleNoReportClick = () => {
    setQuickFilter('no_report_7d');
    setFilterCondition('all');
    setActiveTab('trees');
  };

  const maskPhone = (phone?: string): string => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 4) {
      return `••••${digits.slice(-4)}`;
    }
    return phone;
  };

  if (treesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 p-4 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 h-96 bg-white rounded-xl border border-slate-200 p-6 animate-pulse" />
          <div className="lg:col-span-5 h-96 bg-white rounded-xl border border-slate-200 p-6 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Lightbox Modal */}
      {activePhoto && (
        <PhotoLightbox
          imageUrl={activePhoto.url}
          caption={activePhoto.caption}
          onClose={() => setActivePhoto(null)}
        />
      )}

      {/* Top Stat Tiles: 6 columns */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Trees */}
        <div
          onClick={() => {
            setFilterCondition('all');
            setQuickFilter('all');
            setActiveTab('trees');
          }}
          className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Total Trees</span>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition-colors">
              <TreeDeciduous className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 font-sans">
              {counts.total}
            </span>
            <span className="text-xs text-slate-600 font-medium">trees</span>
          </div>
          <div className="mt-1 text-xs text-emerald-700 font-medium flex items-center gap-1">
            <span>View inventory</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Healthy */}
        <div
          onClick={() => handleConditionTileClick('healthy')}
          className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-emerald-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Healthy</span>
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200 transition-colors">
              <Check className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-700 font-sans">
              {counts.healthy}
            </span>
            <span className="text-xs text-slate-600 font-medium">({counts.healthyPct}%)</span>
          </div>
          <div className="mt-1 text-xs text-slate-600 font-medium">Optimal health</div>
        </div>

        {/* Minor Issues */}
        <div
          onClick={() => handleConditionTileClick('minor')}
          className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-amber-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Minor</span>
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-700 group-hover:bg-amber-200 transition-colors">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-700 font-sans">
              {counts.minor}
            </span>
            <span className="text-xs text-slate-600 font-medium">({counts.minorPct}%)</span>
          </div>
          <div className="mt-1 text-xs text-slate-600 font-medium">Observation needed</div>
        </div>

        {/* Emergency */}
        <div
          onClick={() => handleConditionTileClick('emergency')}
          className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-rose-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Emergency</span>
            <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700 group-hover:bg-rose-200 transition-colors">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-rose-700 font-sans">
              {counts.emergency}
            </span>
            <span className="text-xs text-slate-600 font-medium">({counts.emergencyPct}%)</span>
          </div>
          <div className="mt-1 text-xs text-rose-700 font-medium">Urgent attention</div>
        </div>

        {/* Not Assessed */}
        <div
          onClick={() => handleConditionTileClick('not_assessed')}
          className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Not Assessed</span>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-slate-200 transition-colors">
              <Minus className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-700 font-sans">
              {counts.notAssessed}
            </span>
            <span className="text-xs text-slate-600 font-medium">({counts.notAssessedPct}%)</span>
          </div>
          <div className="mt-1 text-xs text-slate-600 font-medium">Awaiting inspection</div>
        </div>

        {/* No Report in 7+ Days */}
        <div
          onClick={handleNoReportClick}
          className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs hover:border-amber-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">No Report 7d+</span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700 group-hover:bg-amber-100 transition-colors">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 font-sans">
              {counts.noReport7d}
            </span>
            <span className="text-xs text-slate-600 font-medium">trees</span>
          </div>
          <div className="mt-1 text-xs text-amber-700 font-medium flex items-center gap-1">
            <span>Filter trees</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Needs Attention Card (Requirement 12) */}
      {attentionTrees.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <h2 className="text-sm font-bold text-slate-900">Needs Attention ({attentionTrees.length})</h2>
              <span className="text-xs text-slate-600 font-medium hidden sm:inline">
                Emergency & minor condition trees requiring follow-up
              </span>
            </div>
            <button
              onClick={() => {
                setQuickFilter('emergency');
                setActiveTab('trees');
              }}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
            >
              <span>View in Table</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {attentionTrees.map((tree) => {
              const variantObj = variants.find((v) => v.code === tree.variant);
              const variantName = variantObj?.name || tree.variant || '—';
              const lastReportText = formatTimeAgo(tree.lastReportAt);

              return (
                <div
                  key={tree.id}
                  onClick={() => handleInspectTree(tree.id)}
                  className="p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold font-mono text-slate-900 bg-slate-100 px-2 py-1 rounded">
                      {tree.id}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900">
                          {tree.variant} · {variantName}
                        </span>
                        <span className="text-xs text-slate-600">Block {tree.block || '—'}</span>
                      </div>
                      {tree.conditionNotes ? (
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{tree.conditionNotes}</p>
                      ) : tree.notes ? (
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{tree.notes}</p>
                      ) : (
                        <p className="text-xs text-slate-400 italic mt-0.5">No specific issue notes</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                    <ConditionBadge condition={tree.condition} size="sm" />
                    <span className="text-xs text-slate-600 font-sans flex items-center gap-1 min-w-[90px] justify-end">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {lastReportText}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Grid: Block Breakdown (Left 7 cols) & Latest Field Reports (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Block Distribution (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Block Distribution</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Trees by orchard block, sorted A to E by default
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-600">
              {blockStats.length} blocks
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wide">
                <tr>
                  <th
                    onClick={() => handleBlockSort('block')}
                    className="py-3 px-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Block</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleBlockSort('total')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Trees</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleBlockSort('healthy')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right text-emerald-800"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Healthy</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleBlockSort('minor')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right text-amber-800"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Minor</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleBlockSort('emergency')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right text-rose-800"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Emerg.</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleBlockSort('not_assessed')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 transition-colors text-right text-slate-700"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Not Assessed</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleBlockSort('fruits')}
                    className="py-3 px-3.5 cursor-pointer hover:bg-slate-100 transition-colors text-right text-emerald-800"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Est. Fruits</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {blockStats.map((row) => (
                  <tr
                    key={row.block}
                    onClick={() => {
                      setFilterBlock(row.block);
                      setActiveTab('trees');
                    }}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 font-sans">
                      Block {row.block}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-800">
                      {row.total}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-medium">
                      {row.healthy}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700 font-medium">
                      {row.minor}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-700 font-bold">
                      {row.emergency}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 font-medium">
                      {row.not_assessed}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-bold text-emerald-800">
                      {row.fruits.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Latest Field Reports (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Latest Field Reports</h2>
              <span className="text-xs text-slate-600 font-medium">Live WhatsApp bot stream</span>
            </div>
            <button
              onClick={() => setActiveTab('reports')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors"
            >
              <span>All Reports ({totalReportsCount})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[600px] pr-0.5">
            {reportsLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-28 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : latestReports.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">No inspection reports submitted yet.</p>
                <p className="text-xs text-slate-500 mt-1">Field inspections submitted via WhatsApp will appear here live.</p>
              </div>
            ) : (
              latestReports.map((report) => {
                const photos = report.photos || [];
                const tree = trees.find((t) => t.id === report.treeId);
                const workerMasked = maskPhone(report.workerPhone);

                return (
                  <div
                    key={report.id}
                    onClick={() => handleInspectTree(report.treeId)}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer space-y-2.5"
                  >
                    {/* 1. Report date on top of report card */}
                    <div className="flex items-center justify-between text-xs text-slate-600 border-b border-slate-200/70 pb-1.5">
                      <div className="flex items-center gap-1.5 font-sans font-medium text-slate-700">
                        <span>{formatDateWithAgo(report.createdAt)}</span>
                      </div>
                      {report.conditionAfter && (
                        <ConditionBadge condition={report.conditionAfter} size="sm" />
                      )}
                    </div>

                    {/* 2. Header row: Tree A12 · MK */}
                    <div>
                      <h4 className="text-xs font-bold font-mono text-slate-900">
                        Tree {report.treeId} · {tree?.variant || 'MK'}
                      </h4>
                      {/* 3. Subheading: Block name */}
                      <p className="text-xs text-slate-600 mt-0.5">
                        Block {report.block || tree?.block || '—'}
                      </p>
                    </div>

                    {/* Condition changed indicator if conditionChanged is true */}
                    {report.conditionChanged && (
                      <div className="p-2 rounded-lg bg-amber-50/80 border border-amber-200/60 flex items-center gap-1.5 text-xs text-amber-900 font-medium">
                        <span>Condition changed:</span>
                        <ConditionBadge condition={report.conditionBefore || 'not_assessed'} size="sm" />
                        <span>→</span>
                        <ConditionBadge condition={report.conditionAfter || 'minor'} size="sm" />
                      </div>
                    )}

                    {/* Description */}
                    {report.description && (
                      <p className="text-xs text-slate-700 leading-relaxed bg-white p-2 rounded border border-slate-200/60">
                        {report.description}
                      </p>
                    )}

                    {/* Thumbnails (up to 3) + Worker */}
                    <div className="flex items-center justify-between pt-1">
                      {photos.length > 0 ? (
                        <div className="flex items-center gap-2">
                          {photos.slice(0, 3).map((photo, pIdx) => (
                            <DashboardReportThumb
                              key={pIdx}
                              photo={photo}
                              idx={pIdx}
                              reportDate={report.createdAt}
                              treeId={report.treeId}
                              onOpen={(url, caption) => setActivePhoto({ url, caption })}
                            />
                          ))}
                          {photos.length > 3 && (
                            <span className="text-xs text-slate-500 font-medium">
                              +{photos.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <div />
                      )}

                      {workerMasked && (
                        <div className="flex items-center gap-1 text-xs text-slate-600 font-mono">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{workerMasked}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
