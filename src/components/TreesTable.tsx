import React, { useState, useMemo, useEffect } from 'react';
import { useFarm, formatDateTime, formatDate, normalizeTimestamp, formatTimeAgo } from '../context/FarmContext';
import { ConditionBadge } from './ConditionBadge';
import { DurianTree, TreeCondition } from '../types';
import {
  Search,
  Download,
  ArrowUpDown,
  RotateCcw,
  TreeDeciduous,
  Plus,
  Eye,
  Clock,
  AlertOctagon,
  AlertTriangle,
  Minus,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface TreesTableProps {
  onSelectTree: (treeId: string) => void;
  onAddNewTree?: () => void;
}

export const TreesTable: React.FC<TreesTableProps> = ({ onSelectTree, onAddNewTree }) => {
  const {
    trees,
    variants,
    filterBlock,
    setFilterBlock,
    filterCondition,
    setFilterCondition,
    quickFilter,
    setQuickFilter,
  } = useFarm();

  const [searchId, setSearchId] = useState('');
  const [filterVariant, setFilterVariant] = useState('all');

  // Pagination: 50 rows per page
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 50;

  // Sorting
  const [sortField, setSortField] = useState<keyof DurianTree>('id');
  const [sortAsc, setSortAsc] = useState(true);

  // Distinct blocks
  const availableBlocks = useMemo(() => {
    const set = new Set<string>();
    trees.forEach((t) => {
      if (t.block) set.add(t.block);
    });
    return Array.from(set).sort();
  }, [trees]);

  // Variant lookup
  const variantLookup = useMemo(() => {
    const map = new Map<string, string>();
    variants.forEach((v) => {
      map.set(v.code, v.name);
    });
    return map;
  }, [variants]);

  // Reset pagination when any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchId, filterBlock, filterVariant, filterCondition, quickFilter]);

  // Filtering
  const filteredTrees = useMemo(() => {
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return trees.filter((tree) => {
      // Search by ID
      if (searchId.trim()) {
        const query = searchId.trim().toLowerCase();
        if (!tree.id.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Filter by block
      if (filterBlock !== 'all' && tree.block !== filterBlock) {
        return false;
      }

      // Filter by variant
      if (filterVariant !== 'all' && tree.variant !== filterVariant) {
        return false;
      }

      // Filter by condition dropdown
      if (filterCondition !== 'all' && tree.condition !== filterCondition) {
        return false;
      }

      // Quick filter chips
      if (quickFilter === 'emergency' && tree.condition !== 'emergency') return false;
      if (quickFilter === 'minor' && tree.condition !== 'minor') return false;
      if (quickFilter === 'not_assessed' && tree.condition !== 'not_assessed') return false;
      if (quickFilter === 'no_report_7d') {
        const repTime = normalizeTimestamp(tree.lastReportAt);
        if (repTime && repTime >= sevenDaysAgoMs) return false;
      }

      return true;
    });
  }, [trees, searchId, filterBlock, filterVariant, filterCondition, quickFilter]);

  // Sorting
  const sortedTrees = useMemo(() => {
    const list = [...filteredTrees];
    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (sortField === 'datePlanted' || sortField === 'lastReportAt') {
        const timeA = normalizeTimestamp(valA);
        const timeB = normalizeTimestamp(valB);
        return sortAsc ? timeA - timeB : timeB - timeA;
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();

      return sortAsc
        ? strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' })
        : strB.localeCompare(strA, undefined, { numeric: true, sensitivity: 'base' });
    });
    return list;
  }, [filteredTrees, sortField, sortAsc]);

  // Paginated chunk
  const totalPages = Math.max(1, Math.ceil(sortedTrees.length / rowsPerPage));
  const paginatedTrees = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return sortedTrees.slice(start, start + rowsPerPage);
  }, [sortedTrees, currentPage]);

  const handleSort = (field: keyof DurianTree) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleResetFilters = () => {
    setSearchId('');
    setFilterBlock('all');
    setFilterVariant('all');
    setFilterCondition('all');
    setQuickFilter('all');
    setCurrentPage(1);
  };

  const handleChipClick = (chipKey: string) => {
    if (quickFilter === chipKey) {
      setQuickFilter('all');
      setFilterCondition('all');
    } else {
      setQuickFilter(chipKey);
      if (chipKey === 'emergency' || chipKey === 'minor' || chipKey === 'not_assessed') {
        setFilterCondition(chipKey);
      } else {
        setFilterCondition('all');
      }
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    if (filteredTrees.length === 0) return;

    const headers = [
      'Tree ID',
      'Block',
      'Variant Code',
      'Variant Name',
      'Condition',
      'Condition Notes',
      'Trunk Girth (cm)',
      'Canopy Spread (cm)',
      'Flower Clusters',
      'Estimated Fruits',
      'Supplier',
      'Date Planted',
      'General Notes',
      'Last Report Timestamp',
    ];

    const rows = sortedTrees.map((tree) => {
      const variantName = variantLookup.get(tree.variant) || '';
      return [
        `"${tree.id}"`,
        `"${tree.block}"`,
        `"${tree.variant}"`,
        `"${variantName.replace(/"/g, '""')}"`,
        `"${tree.condition || 'not_assessed'}"`,
        `"${(tree.conditionNotes || '').replace(/"/g, '""')}"`,
        tree.trunkSize ?? '',
        `"${tree.canopySize ?? ''}"`,
        tree.floweringClusters ?? '',
        tree.estimatedFruitCount ?? '',
        `"${(tree.supplier || '').replace(/"/g, '""')}"`,
        `"${formatDate(tree.datePlanted)}"`,
        `"${(tree.notes || '').replace(/"/g, '""')}"`,
        `"${formatDateTime(tree.lastReportAt)}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `cilowong_trees_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasActiveFilters =
    searchId !== '' ||
    filterBlock !== 'all' ||
    filterVariant !== 'all' ||
    filterCondition !== 'all' ||
    quickFilter !== 'all';

  const startRecord = (currentPage - 1) * rowsPerPage + 1;
  const endRecord = Math.min(currentPage * rowsPerPage, sortedTrees.length);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
      {/* Top Controls: Search, Dropdowns, Quick Chips, Actions */}
      <div className="p-4 sm:p-5 border-b border-slate-200 space-y-3.5 bg-slate-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TreeDeciduous className="w-5 h-5 text-emerald-600" />
              <span>Durian Tree Inventory</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Individual tree condition records, biometrics, and inspection logs
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={filteredTrees.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50"
              title="Export visible tree records to CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>

            {onAddNewTree && (
              <button
                onClick={onAddNewTree}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Tree</span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search by ID */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search tree ID (e.g. A12)..."
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none placeholder:text-slate-500"
            />
          </div>

          {/* Block dropdown */}
          <div>
            <select
              value={filterBlock}
              onChange={(e) => setFilterBlock(e.target.value)}
              className="w-full text-xs py-2 px-3 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="all">All Blocks</option>
              {availableBlocks.map((b) => (
                <option key={b} value={b}>
                  Block {b}
                </option>
              ))}
            </select>
          </div>

          {/* Variant dropdown */}
          <div>
            <select
              value={filterVariant}
              onChange={(e) => setFilterVariant(e.target.value)}
              className="w-full text-xs py-2 px-3 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="all">All Variants</option>
              {variants.map((v) => (
                <option key={v.code} value={v.code}>
                  {v.code} - {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Condition dropdown */}
          <div>
            <select
              value={filterCondition}
              onChange={(e) => {
                setFilterCondition(e.target.value);
                setQuickFilter('all');
              }}
              className="w-full text-xs py-2 px-3 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="all">All Conditions</option>
              <option value="healthy">Healthy</option>
              <option value="minor">Minor Issue</option>
              <option value="emergency">Emergency</option>
              <option value="not_assessed">Not assessed</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Chips (Requirement 19) */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60">
          <span className="text-xs font-semibold text-slate-600">Quick Filters:</span>

          <button
            onClick={() => handleChipClick('emergency')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
              quickFilter === 'emergency'
                ? 'bg-rose-100 text-rose-800 border-rose-300 ring-2 ring-rose-400'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-rose-50 hover:text-rose-700'
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
            <span>Emergency</span>
          </button>

          <button
            onClick={() => handleChipClick('minor')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
              quickFilter === 'minor'
                ? 'bg-amber-100 text-amber-800 border-amber-300 ring-2 ring-amber-400'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-amber-50 hover:text-amber-700'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Minor</span>
          </button>

          <button
            onClick={() => handleChipClick('not_assessed')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
              quickFilter === 'not_assessed'
                ? 'bg-slate-200 text-slate-800 border-slate-400 ring-2 ring-slate-400'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            <Minus className="w-3.5 h-3.5 text-slate-600" />
            <span>Not assessed</span>
          </button>

          <button
            onClick={() => handleChipClick('no_report_7d')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
              quickFilter === 'no_report_7d'
                ? 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-400 font-bold'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-amber-50 hover:text-amber-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>No report in 7+ days</span>
          </button>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-rose-800 hover:bg-rose-50 rounded-full transition-colors ml-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Pagination summary bar */}
      <div className="px-4 sm:px-5 py-2.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
        <div>
          {sortedTrees.length > 0 ? (
            <span>
              Showing <span className="font-semibold text-slate-900">{startRecord}</span>–
              <span className="font-semibold text-slate-900">{endRecord}</span> of{' '}
              <span className="font-bold text-slate-900">{sortedTrees.length}</span> trees
              {filteredTrees.length !== trees.length && (
                <span className="text-slate-500"> (filtered from {trees.length} total)</span>
              )}
            </span>
          ) : (
            <span>No trees found</span>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4 text-slate-700" />
            </button>
            <span className="px-2 font-medium font-sans text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors"
              title="Next page"
            >
              <ChevronRight className="w-4 h-4 text-slate-700" />
            </button>
          </div>
        )}
      </div>

      {/* Empty State */}
      {sortedTrees.length === 0 ? (
        <div className="p-12 text-center">
          <TreeDeciduous className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-900">No trees match your criteria</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting search terms, block selections, or condition filters.
          </p>
          <button
            onClick={handleResetFilters}
            className="mt-4 px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          {/* Mobile Card View under 768px (Requirement 20) */}
          <div className="block md:hidden divide-y divide-slate-100">
            {paginatedTrees.map((tree) => {
              const variantName = variantLookup.get(tree.variant);
              return (
                <div
                  key={tree.id}
                  onClick={() => onSelectTree(tree.id)}
                  className="p-4 hover:bg-slate-50 transition-colors cursor-pointer space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {tree.id}
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        {tree.variant} {variantName ? `· ${variantName}` : ''}
                      </span>
                    </div>
                    <ConditionBadge condition={tree.condition} size="sm" />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Block {tree.block || '—'}</span>
                    <span className="flex items-center gap-1 font-sans text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {formatTimeAgo(tree.lastReportAt)}
                    </span>
                  </div>

                  {/* Notes truncated with ellipsis */}
                  {(tree.conditionNotes || tree.notes) && (
                    <p
                      title={tree.conditionNotes || tree.notes}
                      className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 line-clamp-2"
                    >
                      {tree.conditionNotes || tree.notes}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                    <span>
                      Girth: <strong className="font-mono text-slate-800">{tree.trunkSize !== undefined ? `${tree.trunkSize} cm` : '—'}</strong>
                    </span>
                    <span>
                      Fruits: <strong className="font-mono text-emerald-700 font-bold">{tree.estimatedFruitCount !== undefined ? tree.estimatedFruitCount : '—'}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View >= 768px with Sticky Header (Requirement 8) */}
          <div className="hidden md:block overflow-x-auto flex-1 max-h-[640px] relative">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white font-semibold uppercase tracking-wide border-b border-slate-800 shadow-xs">
                <tr>
                  <th
                    onClick={() => handleSort('id')}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-800 transition-colors min-w-[90px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Tree ID</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('variant')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition-colors min-w-[130px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Variant</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('block')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition-colors min-w-[70px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Block</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('condition')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition-colors min-w-[120px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Condition</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('trunkSize')}
                    className="py-3 px-3 text-right cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Girth (cm)</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('canopySize')}
                    className="py-3 px-3 text-right cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Canopy</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('floweringClusters')}
                    className="py-3 px-3 text-right cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Clusters</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('estimatedFruitCount')}
                    className="py-3 px-3 text-right cursor-pointer hover:bg-slate-800 transition-colors text-emerald-300"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Fruits</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('supplier')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Supplier</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('datePlanted')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition-colors min-w-[100px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Planted</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3 min-w-[140px]">Notes</th>
                  <th
                    onClick={() => handleSort('lastReportAt')}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition-colors min-w-[110px]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Last Report</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTrees.map((tree) => {
                  const variantName = variantLookup.get(tree.variant);
                  return (
                    <tr
                      key={tree.id}
                      onClick={() => onSelectTree(tree.id)}
                      className="hover:bg-slate-50/90 transition-colors cursor-pointer group"
                    >
                      {/* Tree ID - Monospace */}
                      <td className="py-3 px-4 font-bold font-mono text-emerald-800">
                        {tree.id}
                      </td>

                      {/* Variant - Monospace code, Sans name */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                            {tree.variant}
                          </span>
                          {variantName && (
                            <span className="text-slate-600 truncate max-w-[110px]" title={variantName}>
                              {variantName}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Block - Sans font */}
                      <td className="py-3 px-3 font-medium text-slate-700 font-sans">
                        Block {tree.block || '—'}
                      </td>

                      {/* Condition Badge */}
                      <td className="py-3 px-3">
                        <ConditionBadge condition={tree.condition} size="sm" />
                      </td>

                      {/* Trunk Girth - Monospace */}
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {tree.trunkSize !== undefined ? tree.trunkSize : '—'}
                      </td>

                      {/* Canopy Spread - Monospace */}
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {tree.canopySize !== undefined && tree.canopySize !== '' ? tree.canopySize : '—'}
                      </td>

                      {/* Flower Clusters - Monospace */}
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {tree.floweringClusters !== undefined ? tree.floweringClusters : '—'}
                      </td>

                      {/* Estimated Fruits - Monospace */}
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-emerald-800">
                        {tree.estimatedFruitCount !== undefined ? tree.estimatedFruitCount : '—'}
                      </td>

                      {/* Supplier - Sans */}
                      <td className="py-3 px-3 text-slate-600 font-sans">
                        {tree.supplier || '—'}
                      </td>

                      {/* Date Planted - Sans */}
                      <td className="py-3 px-3 text-slate-600 font-sans whitespace-nowrap">
                        {formatDate(tree.datePlanted)}
                      </td>

                      {/* Notes with tooltip */}
                      <td className="py-3 px-3 max-w-[180px]">
                        {tree.conditionNotes || tree.notes ? (
                          <span
                            title={tree.conditionNotes || tree.notes}
                            className="block truncate text-slate-700"
                          >
                            {tree.conditionNotes || tree.notes}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Last Report - Sans */}
                      <td className="py-3 px-3 text-slate-600 font-sans whitespace-nowrap">
                        {formatTimeAgo(tree.lastReportAt)}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTree(tree.id);
                          }}
                          className="p-1 rounded-md text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                          title="View tree details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Bottom pagination controls */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
          <div>
            Page <span className="font-semibold text-slate-900">{currentPage}</span> of{' '}
            <span className="font-semibold text-slate-900">{totalPages}</span> ({sortedTrees.length} trees total)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors font-medium text-slate-700"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors font-medium text-slate-700"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
