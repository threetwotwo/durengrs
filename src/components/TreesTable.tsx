import React, { useMemo } from 'react';
import { useFarm, formatDateTime, formatDate, normalizeTimestamp, formatTimeAgo } from '../context/FarmContext';
import { ConditionBadge } from './ConditionBadge';
import { Link } from './Link';
import { PageHeader, btnSecondary, inputCls } from './PageHeader';
import { navigate, treeUrl, useQueryParams } from '../lib/router';
import { followUpOf, waitingLabel } from '../lib/insights';
import { formatShortDate } from '../lib/treatments';
import { DurianTree } from '../types';
import { Search, Download, ArrowUpDown, ArrowUp, ArrowDown, RotateCcw, TreeDeciduous, Clock, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';

const ROWS_PER_PAGE = 50;
type SortField = keyof DurianTree;

const CONDITION_CHIPS: Array<{ id: string; label: string; active: string; dot: string }> = [
  { id: 'all', label: 'All', active: 'bg-slate-900 text-white border-slate-900', dot: '' },
  { id: 'emergency', label: 'Emergency', active: 'bg-rose-600 text-white border-rose-600', dot: 'bg-rose-500' },
  { id: 'minor', label: 'Minor', active: 'bg-amber-500 text-slate-900 border-amber-500', dot: 'bg-amber-400' },
  { id: 'healthy', label: 'Healthy', active: 'bg-emerald-600 text-white border-emerald-600', dot: 'bg-emerald-500' },
  { id: 'not_assessed', label: 'Not assessed', active: 'bg-slate-600 text-white border-slate-600', dot: 'bg-slate-300' },
];

/** All filters, sorting and paging live in the URL, e.g. #/trees?block=A&condition=emergency&sort=lastReportAt */
export const TreesTable: React.FC = () => {
  const { trees, variants, treatments } = useFarm();
  const [params, setParams] = useQueryParams();

  const search = params.get('q') || '';
  const filterBlock = params.get('block') || 'all';
  const filterVariant = params.get('variant') || 'all';
  const filterCondition = params.get('condition') || 'all';
  const staleOnly = params.get('stale') === '1';
  const followUpOnly = params.get('followup') === '1';
  const untreatedOnly = params.get('untreated') === '1';
  const allColumns = params.get('cols') !== 'less'; // every column by default
  const sortField = (params.get('sort') || 'id') as SortField;
  const sortAsc = params.get('dir') !== 'desc';
  const requestedPage = Math.max(1, Number(params.get('page')) || 1);

  const availableBlocks = useMemo(
    () => Array.from(new Set(trees.map((t) => t.block).filter(Boolean))).sort(),
    [trees]
  );
  const variantLookup = useMemo(() => new Map(variants.map((v) => [v.code, v.name])), [variants]);

  // Latest treatment per block (treatments are logged per block).
  const lastTreatmentByBlock = useMemo(() => {
    const map = new Map<string, { date: string; name: string }>();
    for (const x of treatments) {
      for (const b of x.blocks || []) {
        const prev = map.get(b);
        if (!prev || x.date > prev.date) map.set(b, { date: x.date, name: x.planName });
      }
    }
    return map;
  }, [treatments]);

  const isStale = (tree: DurianTree) => {
    const rep = normalizeTimestamp(tree.lastReportAt);
    return !rep || rep < Date.now() - 7 * 24 * 60 * 60 * 1000;
  };

  // Filter everything except condition first, so the condition chips can show counts for the rest.
  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trees.filter((tree) => {
      if (q && !tree.id.toLowerCase().includes(q)) return false;
      if (filterBlock !== 'all' && tree.block !== filterBlock) return false;
      if (filterVariant !== 'all' && tree.variant !== filterVariant) return false;
      if (staleOnly && !isStale(tree)) return false;
      if (followUpOnly && !followUpOf(tree, normalizeTimestamp(tree.lastReportAt)).needs) return false;
      if (untreatedOnly && lastTreatmentByBlock.has(tree.block)) return false;
      return true;
    });
  }, [trees, search, filterBlock, filterVariant, staleOnly, followUpOnly, untreatedOnly, lastTreatmentByBlock]);

  const conditionCounts = useMemo(() => {
    const c: Record<string, number> = { all: baseFiltered.length, emergency: 0, minor: 0, healthy: 0, not_assessed: 0 };
    baseFiltered.forEach((t) => {
      const k = t.condition === 'emergency' || t.condition === 'minor' || t.condition === 'healthy' ? t.condition : 'not_assessed';
      c[k]++;
    });
    return c;
  }, [baseFiltered]);

  const filteredTrees = useMemo(
    () =>
      filterCondition === 'all'
        ? baseFiltered
        : baseFiltered.filter((t) => (t.condition || 'not_assessed') === filterCondition),
    [baseFiltered, filterCondition]
  );

  const sortedTrees = useMemo(() => {
    const list = [...filteredTrees];
    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (sortField === 'datePlanted' || sortField === 'lastReportAt') {
        const diff = normalizeTimestamp(valA) - normalizeTimestamp(valB);
        return sortAsc ? diff : -diff;
      }
      // Empty values always sink to the bottom, whichever way you sort.
      if (valA === '' && valB !== '') return 1;
      if (valB === '' && valA !== '') return -1;
      if (typeof valA === 'number' && typeof valB === 'number') return sortAsc ? valA - valB : valB - valA;
      const cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [filteredTrees, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedTrees.length / ROWS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const paginatedTrees = useMemo(
    () => sortedTrees.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE),
    [sortedTrees, currentPage]
  );

  const setPage = (n: number) => {
    setParams({ page: n <= 1 ? null : String(n) });
    window.scrollTo({ top: 0 });
  };
  const handleSort = (field: SortField) => {
    if (sortField === field) setParams({ dir: sortAsc ? 'desc' : null, page: null });
    else setParams({ sort: field === 'id' ? null : field, dir: null, page: null });
  };
  const resetFilters = () =>
    setParams({ q: null, block: null, variant: null, condition: null, stale: null, followup: null, untreated: null, page: null });

  const activeFilterCount = [search, filterBlock !== 'all', filterVariant !== 'all', filterCondition !== 'all', staleOnly, followUpOnly, untreatedOnly].filter(Boolean).length;

  // CSV Export
  const handleExportCSV = () => {
    if (sortedTrees.length === 0) return;

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


  const startRecord = sortedTrees.length === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1;
  const endRecord = Math.min(currentPage * ROWS_PER_PAGE, sortedTrees.length);

  const SortHeader: React.FC<{ field: SortField; label: string; align?: 'right'; className?: string }> = ({ field, label, align, className = '' }) => {
    const active = sortField === field;
    const Icon = !active ? ArrowUpDown : sortAsc ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={active ? (sortAsc ? 'ascending' : 'descending') : 'none'} className={`px-3 ${className}`}>
        <button
          onClick={() => handleSort(field)}
          className={`w-full min-h-11 flex items-center gap-1 uppercase tracking-wide font-semibold text-xs hover:text-white ${
            align === 'right' ? 'justify-end' : ''
          } ${active ? 'text-emerald-300' : 'text-slate-200'}`}
        >
          {label}
          <Icon className={`w-3.5 h-3.5 ${active ? 'text-emerald-300' : 'text-slate-500'}`} />
        </button>
      </th>
    );
  };

  const note = (tree: DurianTree) => tree.conditionNotes || tree.notes || '';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trees"
        description={
          <span className="tabular">
            {activeFilterCount > 0 ? `${sortedTrees.length} of ${trees.length} trees match` : `${trees.length} trees in ${availableBlocks.length} blocks`}
          </span>
        }
        actions={
          <button onClick={handleExportCSV} disabled={sortedTrees.length === 0} className={`${btnSecondary} disabled:opacity-50`} title="Download the trees shown as a CSV file">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative col-span-2 lg:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              placeholder="Search tree ID, e.g. A12"
              value={search}
              onChange={(e) => setParams({ q: e.target.value, page: null })}
              aria-label="Search tree ID"
              className={`${inputCls} pl-9`}
            />
          </div>
          <select value={filterBlock} onChange={(e) => setParams({ block: e.target.value, page: null })} aria-label="Block" className={inputCls}>
            <option value="all">All blocks</option>
            {availableBlocks.map((b) => (
              <option key={b} value={b}>Block {b}</option>
            ))}
          </select>
          <select value={filterVariant} onChange={(e) => setParams({ variant: e.target.value, page: null })} aria-label="Variant" className={inputCls}>
            <option value="all">All variants</option>
            {variants.map((v) => (
              <option key={v.code} value={v.code}>{v.code} · {v.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Condition">
          {CONDITION_CHIPS.map((chip) => {
            const on = filterCondition === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => setParams({ condition: chip.id, page: null })}
                aria-pressed={on}
                className={`min-h-11 px-3.5 rounded-full border text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                  on ? chip.active : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {chip.dot && <span className={`w-2.5 h-2.5 rounded-full ${chip.dot}`} />}
                {chip.label}
                <span className={`tabular text-xs ${on ? 'opacity-90' : 'text-slate-500'}`}>{conditionCounts[chip.id]}</span>
              </button>
            );
          })}
          <button
            onClick={() => setParams({ stale: staleOnly ? null : '1', page: null })}
            aria-pressed={staleOnly}
            className={`min-h-11 px-3.5 rounded-full border text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
              staleOnly ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Clock className="w-4 h-4" />
            No report in 7+ days
          </button>
          <button
            onClick={() => setParams({ followup: followUpOnly ? null : '1', page: null })}
            aria-pressed={followUpOnly}
            className={`min-h-11 px-3.5 rounded-full border text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
              followUpOnly ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Overdue for a check
          </button>
          <button
            onClick={() => setParams({ untreated: untreatedOnly ? null : '1', page: null })}
            aria-pressed={untreatedOnly}
            className={`min-h-11 px-3.5 rounded-full border text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
              untreatedOnly ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Never treated
          </button>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="min-h-11 px-3 rounded-full text-sm font-semibold text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1.5 ml-auto">
              <RotateCcw className="w-4 h-4" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {sortedTrees.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <TreeDeciduous className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h2 className="text-sm font-bold text-slate-900">No trees match these filters</h2>
          <p className="text-sm text-slate-600 mt-1">Try a different block, or clear the filters.</p>
          <button onClick={resetFilters} className="mt-4 min-h-11 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <span className="tabular">
              {startRecord}–{endRecord} of {sortedTrees.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setParams({ cols: allColumns ? 'less' : null })}
                aria-pressed={allColumns}
                className="hidden md:inline-flex min-h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 items-center gap-1.5 hover:bg-slate-50"
              >
                <Columns3 className="w-4 h-4" />
                {allColumns ? 'Show fewer columns' : 'Show all columns'}
              </button>
              {totalPages > 1 && <Pager page={currentPage} total={totalPages} onPage={setPage} />}
            </div>
          </div>

          {/* Phones: cards */}
          <ul className="md:hidden divide-y divide-slate-100">
            {paginatedTrees.map((tree) => {
              const variantName = variantLookup.get(tree.variant);
              return (
                <li key={tree.id}>
                  <Link to={treeUrl(tree.id)} className="block p-4 hover:bg-slate-50 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">{tree.id}</span>
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {tree.variant}{variantName ? ` · ${variantName}` : ''}
                        </span>
                      </span>
                      <ConditionBadge condition={tree.condition} size="sm" className="whitespace-nowrap shrink-0" />
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>Block {tree.block || '—'}</span>
                      <span className="flex items-center gap-1 tabular"><Clock className="w-4 h-4 text-slate-400" />{formatTimeAgo(tree.lastReportAt)}</span>
                    </div>
                    {followUpOf(tree, normalizeTimestamp(tree.lastReportAt)).needs && (
                      <p className="text-xs font-semibold text-rose-700">{waitingLabel(followUpOf(tree, normalizeTimestamp(tree.lastReportAt)))}</p>
                    )}
                    {note(tree) && <p className="text-sm text-slate-700 line-clamp-2">{note(tree)}</p>}
                    {tree.estimatedFruitCount !== undefined && (
                      <p className="text-xs text-slate-600">Est. fruits: <strong className="tabular text-slate-900">{tree.estimatedFruitCount}</strong></p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-900">
                <tr>
                  <SortHeader field="id" label="Tree" className="min-w-[88px]" />
                  <SortHeader field="variant" label="Variant" className="min-w-[150px]" />
                  <SortHeader field="block" label="Block" />
                  <SortHeader field="condition" label="Condition" className="min-w-[140px]" />
                  <SortHeader field="estimatedFruitCount" label="Fruits" align="right" />
                  {allColumns && (
                    <>
                      <SortHeader field="trunkSize" label="Girth cm" align="right" />
                      <SortHeader field="canopySize" label="Canopy" align="right" />
                      <SortHeader field="floweringClusters" label="Clusters" align="right" />
                      <SortHeader field="supplier" label="Supplier" />
                      <SortHeader field="datePlanted" label="Planted" />
                    </>
                  )}
                  <SortHeader field="lastReportAt" label="Last report" className="min-w-[120px]" />
                  {allColumns && <th scope="col" className="px-3 text-xs uppercase tracking-wide font-semibold text-slate-200 min-w-[150px]">Last treated</th>}
                  <th scope="col" className="px-3 text-xs uppercase tracking-wide font-semibold text-slate-200 min-w-[180px]">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTrees.map((tree) => {
                  const variantName = variantLookup.get(tree.variant);
                  return (
                    <tr key={tree.id} onClick={() => navigate(treeUrl(tree.id))} className="hover:bg-slate-50 cursor-pointer">
                      <td className="py-3 px-3">
                        <Link to={treeUrl(tree.id)} onClick={(e) => e.stopPropagation()} className="font-bold font-mono text-emerald-800 hover:underline">
                          {tree.id}
                        </Link>
                      </td>
                      <td className="py-3 px-3">
                        <span className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-xs">{tree.variant}</span>
                          {variantName && <span className="text-slate-600 truncate max-w-[110px]" title={variantName}>{variantName}</span>}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap">Block {tree.block || '—'}</td>
                      <td className="py-3 px-3"><ConditionBadge condition={tree.condition} size="sm" className="whitespace-nowrap" /></td>
                      <td className="py-3 px-3 text-right font-mono tabular font-bold text-emerald-800">{tree.estimatedFruitCount ?? '—'}</td>
                      {allColumns && (
                        <>
                          <td className="py-3 px-3 text-right font-mono tabular text-slate-700">{tree.trunkSize ?? '—'}</td>
                          <td className="py-3 px-3 text-right font-mono tabular text-slate-700">{tree.canopySize !== undefined && tree.canopySize !== '' ? tree.canopySize : '—'}</td>
                          <td className="py-3 px-3 text-right font-mono tabular text-slate-700">{tree.floweringClusters ?? '—'}</td>
                          <td className="py-3 px-3 text-slate-600">{tree.supplier || '—'}</td>
                          <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{formatDate(tree.datePlanted)}</td>
                        </>
                      )}
                      <td className={`py-3 px-3 whitespace-nowrap tabular ${followUpOf(tree, normalizeTimestamp(tree.lastReportAt)).needs ? 'text-rose-700 font-semibold' : isStale(tree) ? 'text-amber-700 font-medium' : 'text-slate-600'}`}>{formatTimeAgo(tree.lastReportAt)}</td>
                      {allColumns && (
                        <td className="py-3 px-3 whitespace-nowrap text-slate-600" title={lastTreatmentByBlock.get(tree.block)?.name}>
                          {lastTreatmentByBlock.get(tree.block) ? formatShortDate(lastTreatmentByBlock.get(tree.block)!.date) : <span className="text-slate-400">Never</span>}
                        </td>
                      )}
                      <td className="py-3 px-3 max-w-[240px]">
                        {note(tree) ? <span title={note(tree)} className="block truncate text-slate-700">{note(tree)}</span> : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <Pager page={currentPage} total={totalPages} onPage={setPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Pager: React.FC<{ page: number; total: number; onPage: (n: number) => void }> = ({ page, total, onPage }) => (
  <div className="flex items-center gap-1.5">
    <button onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className="min-h-9 min-w-9 flex items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40">
      <ChevronLeft className="w-4 h-4" />
    </button>
    <span className="px-2 text-sm font-medium text-slate-700 tabular">Page {page} of {total}</span>
    <button onClick={() => onPage(page + 1)} disabled={page >= total} aria-label="Next page" className="min-h-9 min-w-9 flex items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40">
      <ChevronRight className="w-4 h-4" />
    </button>
  </div>
);
