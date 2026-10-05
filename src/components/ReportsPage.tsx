import React, { useState, useEffect, useMemo } from 'react';
import { useFarm } from '../context/FarmContext';
import { ReportCard } from './ReportCard';
import { PageHeader, inputCls } from './PageHeader';
import { ActivityView } from './ActivityView';
import { FieldLog } from './FieldLog';
import { Link } from './Link';
import { useQueryParams } from '../lib/router';
import { useT } from '../i18n';
import { TreeReport } from '../types';
import { db, parseReportDoc } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { TOPICS, TopicId, isTopicId, pick, topicsForText } from '../lib/guide';
import { useGuideOn } from '../lib/guideMode';
import {
  ClipboardList,
  Search,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { trees, totalReportsCount } = useFarm();
  const { t, lang } = useT();
  const guideOn = useGuideOn();
  const treeById = useMemo(() => new Map(trees.map((x) => [x.id, x])), [trees]);

  const [params, setParams] = useQueryParams();

  const [reports, setReports] = useState<TreeReport[]>([]);
  const [pageLimit, setPageLimit] = useState(25);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<boolean>(false);

  // Filters live in the URL: shareable, survive reload, Back works.
  const search = params.get('q') || '';
  const filterBlock = params.get('block') || 'all';
  const filterCondition = params.get('condition') || 'all';
  const onlyChanged = params.get('changed') === '1';
  const topicParam = params.get('topic');
  const filterTopic: TopicId | null = isTopicId(topicParam) ? topicParam : null;
  const showActivity = params.get('view') === 'activity';
  const showLog = params.get('view') === 'log';

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
    setLoadError(false);
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
        setLoadError(true);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [pageLimit]);

  // Guide topics each loaded report talks about, and how many reports mention each (for the topic filter).
  const reportTopics = useMemo(() => new Map(reports.map((r) => [r.id, topicsForText(r.description)])), [reports]);
  const topicCounts = useMemo(() => {
    const counts = new Map<TopicId, number>();
    reportTopics.forEach((ids) => ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1)));
    return counts;
  }, [reportTopics]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((rep) => {
      if (filterTopic && !reportTopics.get(rep.id)?.includes(filterTopic)) return false;

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

      if (filterBlock !== 'all' && (rep.block || treeById.get(rep.treeId)?.block) !== filterBlock) {
        return false;
      }

      if (onlyChanged && !rep.conditionChanged) {
        return false;
      }

      return true;
    });
  }, [reports, reportTopics, search, filterCondition, filterBlock, onlyChanged, filterTopic, treeById]);

  const handleResetFilters = () => setParams({ q: null, block: null, condition: null, changed: null, topic: null });
  const activeFilterCount = [search, filterBlock !== 'all', filterCondition !== 'all', onlyChanged, filterTopic].filter(Boolean).length;
  // Filters run on the reports loaded so far (newest first), so say so while older ones exist.
  const partialSearch = activeFilterCount > 0 && hasMore;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('rep.title')}
        description={showLog ? t('rep.desc.log') : showActivity ? t('rep.desc.activity') : t('rep.desc.feed', { n: totalReportsCount })}
      />

      <div role="tablist" className="inline-flex p-1 rounded-xl bg-slate-200/70 gap-1">
        {[
          { id: 'feed', label: t('rep.tab.feed'), to: '/reports' },
          { id: 'log', label: t('rep.tab.log'), to: '/reports?view=log' },
          { id: 'activity', label: t('rep.tab.activity'), to: '/reports?view=activity' },
        ].map((tab) => {
          const on = tab.id === (showLog ? 'log' : showActivity ? 'activity' : 'feed');
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

      {showLog ? <FieldLog /> : showActivity ? <ActivityView /> : (
      <>
      <div className={`bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-2 gap-2.5 items-center ${guideOn ? 'lg:grid-cols-[1fr_auto_auto_auto_auto_auto]' : 'lg:grid-cols-[1fr_auto_auto_auto_auto]'}`}>
        <div className="relative col-span-2 lg:col-span-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setParams({ q: e.target.value })}
            placeholder={t('rep.search.placeholder')}
            aria-label={t('rep.search.aria')}
            className={`${inputCls} pl-9`}
          />
        </div>
        <select value={filterBlock} onChange={(e) => setParams({ block: e.target.value })} aria-label={t('rep.filter.block')} className={inputCls}>
          <option value="all">{t('common.allBlocks')}</option>
          {availableBlocks.map((b) => (
            <option key={b} value={b}>{t('common.blockN', { n: b })}</option>
          ))}
        </select>
        <select value={filterCondition} onChange={(e) => setParams({ condition: e.target.value })} aria-label={t('rep.filter.condition')} className={inputCls}>
          <option value="all">{t('common.allConditions')}</option>
          <option value="healthy">{t('cond.healthy')}</option>
          <option value="minor">{t('rep.cond.minor')}</option>
          <option value="emergency">{t('cond.emergency')}</option>
          <option value="not_assessed">{t('cond.not_assessed')}</option>
        </select>
        {guideOn && (
        <select
          value={filterTopic || 'all'}
          onChange={(e) => setParams({ topic: e.target.value === 'all' ? null : e.target.value })}
          aria-label={t('rep.filter.topic')}
          className={inputCls}
        >
          <option value="all">{t('rep.filter.allTopics')}</option>
          {TOPICS.filter((tp) => topicCounts.has(tp.id) || tp.id === filterTopic).map((tp) => (
            <option key={tp.id} value={tp.id}>
              {pick(tp.title, lang)} ({topicCounts.get(tp.id) || 0})
            </option>
          ))}
        </select>
        )}
        <label className="min-h-11 px-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-800 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyChanged}
            onChange={(e) => setParams({ changed: e.target.checked ? '1' : null })}
            className="w-4 h-4 accent-emerald-600"
          />
          {t('rep.filter.changed')}
        </label>
        {activeFilterCount > 0 && (
          <button onClick={handleResetFilters} className="min-h-11 px-3 rounded-lg text-sm font-semibold text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center gap-1.5">
            <RotateCcw className="w-4 h-4" />
            {t('rep.filter.clearN', { n: activeFilterCount })}
          </button>
        )}
      </div>

      {loadError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
          {t('rep.error.load')}
        </div>
      )}

      {filterTopic && guideOn && (
        <p className="text-sm text-slate-700">
          {t('rep.topic.note')}{' '}
          <Link to={`/guide/${filterTopic}`} className="font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2">
            {t('rep.topic.read', { topic: pick(TOPICS.find((tp) => tp.id === filterTopic)!.title, lang) })}
          </Link>
        </p>
      )}

      {partialSearch && (
        <p role="status" className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          {t('rep.partial', { n: reports.length })}
        </p>
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
            <p className="text-sm font-semibold text-slate-700">{activeFilterCount > 0 ? t('rep.empty.title') : t('rep.empty.none')}</p>
            {activeFilterCount > 0 && <p className="text-xs text-slate-500 mt-1">{t(partialSearch ? 'rep.empty.partial' : 'rep.empty.hint', { n: reports.length })}</p>}
            {activeFilterCount > 0 && (
              <button
                onClick={handleResetFilters}
                className="mt-3 min-h-10 px-3 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800"
              >
                {t('common.clear')}
              </button>
            )}
          </div>
        ) : (
          filteredReports.map((report, idx) => (
            <ReportCard key={report.id} report={report} eager={idx < 2} tree={treeById.get(report.treeId)} />
          ))
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
                  <span>{t('rep.loadingOlder')}</span>
                </>
              ) : (
                <span>{partialSearch ? t('rep.loadMoreSearch') : t('rep.loadMore')}</span>
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
