import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Trash2 } from 'lucide-react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db, parseReportDoc } from '../lib/firebase';
import { normalizeTimestamp, useFarm } from '../context/FarmContext';
import { goBack, navigate, treeUrl } from '../lib/router';
import { cachedReport, rememberReport } from '../lib/reportCache';
import { STAGES, STAGE_ORDER, TOPIC_BY_ID, pick, topicsForText, treeStages } from '../lib/guide';
import { useSeasons } from './useSeasons';
import { useGuideOn } from '../lib/guideMode';
import { useT } from '../i18n';
import type { TreeReport } from '../types';
import { ConditionBadge } from './ConditionBadge';
import { improvingNow } from '../lib/trees';
import { ReportDeleteSheet } from './ReportDeleteSheet';
import { ReportChange } from './ReportChange';
import { PhotoGrid, RecordCard, RecordGrid, reportEntry } from './Record';
import { hasWords, reportValues } from '../lib/feed';
import { BloomQuickSet, StagePill, TOPIC_ICON, blockLine } from './GuideWidgets';
import { SeasonTaskChips } from './FieldRecords';
import { Link } from './Link';
import { ReportFindings } from './ReportFindings';
import { ReportProblems } from './Problems';

const card = 'bg-white rounded-xl border border-slate-200 p-4 space-y-3';
const h2 = 'text-sm font-bold text-slate-900';

/**
 * One field report: everything the worker sent and what was read from it (Gemini's findings, the review), the
 * problems it belongs to with their history, the Guide topics the note is about, and where the block is in its season.
 */
export const ReportDetailView: React.FC<{ reportId: string }> = ({ reportId }) => {
  const { t, lang, locale } = useT();
  const guideOn = useGuideOn();
  const { trees, variants, harvestCycles, treeBlooms, workerLabel } = useFarm();
  const [report, setReport] = useState<TreeReport | null | undefined>(() => cachedReport(reportId));
  const [loadError, setLoadError] = useState(false);
  const [others, setOthers] = useState<TreeReport[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Live: a condition fix or a deleted report shows up at once.
  useEffect(() => {
    return onSnapshot(
      doc(db, 'reports', reportId),
      (snap) => {
        if (!snap.exists()) return setReport(null);
        const r = parseReportDoc(snap);
        rememberReport(r);
        setReport(r);
      },
      (err) => {
        console.error('Failed to load report:', err);
        setLoadError(true);
      }
    );
  }, [reportId]);

  // The tree's other recent reports (same index as the tree page).
  const treeId = report?.treeId;
  useEffect(() => {
    if (!treeId) return;
    return onSnapshot(
      query(collection(db, 'reports'), where('treeId', '==', treeId), orderBy('createdAt', 'desc'), limit(7)),
      (snap) => setOthers(snap.docs.map(parseReportDoc)),
      (err) => console.error('Failed to load tree reports:', err)
    );
  }, [treeId]);

  const tree = useMemo(() => trees.find((x) => x.id === treeId), [trees, treeId]);
  const block = report?.block || tree?.block;
  const seasons = useSeasons();
  const season = seasons.find((s) => s.block === block);
  const topics = useMemo(() => topicsForText(report?.description), [report?.description]);

  if (loadError && !report) {
    return <Notice text={t('rep.detail.error')} />;
  }
  if (report === undefined) {
    return <div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" />;
  }
  if (report === null) {
    return <Notice text={t('rep.detail.missing')} />;
  }

  const ts = normalizeTimestamp(report.createdAt);
  const photos = report.photos || [];
  const phone = workerLabel(report.workerPhone);
  const last4 = (report.workerPhone || '').replace(/\D/g, '').slice(-4);
  const changed = report.conditionChanged && report.conditionBefore && report.conditionBefore !== report.conditionAfter;
  const variantName = variants.find((v) => v.code === tree?.variant)?.name || tree?.variant;
  const idx = others.findIndex((r) => r.id === report.id);
  const newer = idx > 0 ? others[idx - 1] : undefined;
  const older = idx >= 0 ? others[idx + 1] : undefined;
  const otherReports = others.filter((r) => r.id !== report.id).slice(0, 5);

  const health = reportValues(report).health;

  // Stages of this tree (it may have flowered apart from its block, or in waves), else of the whole block.
  const tws = tree && season ? treeStages(tree, season, treeBlooms, harvestCycles) : [];
  const stageIds = tws.length ? STAGE_ORDER.filter((st) => tws.some((w) => w.stage === st)) : season?.stages || [];
  const stage = season?.floweredOn && !season.outdated && stageIds.length > 0;
  // Stage actions: those on the topics the note mentions first.
  const actions = stage
    ? stageIds.flatMap((st) => STAGES[st].actions).sort((a, b) => (topics.includes(a.topic) ? 0 : 1) - (topics.includes(b.topic) ? 0 : 1)).slice(0, 3)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => goBack('/reports')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 min-h-9"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('rep.detail.back')}
        </button>
        <nav className="flex items-center gap-1" aria-label={t('rep.detail.nav')}>
          <StepLink report={older} label={t('rep.detail.older')} />
          <StepLink report={newer} label={t('rep.detail.newer')} />
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
        {/* The report: photos first */}
        <article className={`min-w-0 lg:col-span-7 bg-white rounded-xl border overflow-hidden ${health === 'merah' ? 'border-rose-300' : 'border-slate-200'}`}>
          {photos.length > 0 && <PhotoGrid photos={photos} caption={t('rep.treeN', { id: report.treeId })} eager className="aspect-[4/3]" />}
          <div className="p-4 sm:p-5 space-y-4">
            <header className="space-y-0.5">
              <h1 className="text-xl font-bold text-slate-900">
                <Link to={treeUrl(report.treeId)} className="font-mono hover:text-emerald-700 hover:underline underline-offset-2">
                  {report.treeId}
                </Link>
                <span className="ml-2 text-sm font-medium text-slate-500">
                  {[variantName, block ? t('common.blockN', { n: block }) : null].filter(Boolean).join(', ')}
                </span>
              </h1>
              <p className="text-sm text-slate-600 tabular">
                {new Date(ts).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {phone && <span className="ml-2">{phone}</span>}
              </p>
            </header>

            {hasWords(report.description) ? (
              <p className="text-base text-slate-900 leading-relaxed whitespace-pre-line">{report.description}</p>
            ) : (
              <p className="text-sm text-slate-500">{report.description?.trim() ? `${t('rep.noNote')} ${report.description.trim()}` : t('rep.noNote.dot')}</p>
            )}

            <ReportFindings report={report} />
            <FiledRecords report={report} />

            {changed && (
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
                {t('cond.changed')}:
                <ConditionBadge condition={report.conditionBefore!} size="sm" />
                <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                <ConditionBadge condition={report.conditionAfter || 'not_assessed'} size="sm" />
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <ReportChange report={report} tree={tree} />
              <span className="inline-flex items-center gap-1">
                {last4 && (
                  <Link to={`/reports?q=${last4}`} className="min-h-9 px-2 text-sm font-semibold text-emerald-700 hover:underline inline-flex items-center">
                    {t('rep.allFromWorker')}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setDeleting(true)}
                  aria-label={t('rep.del.button')}
                  className="min-h-9 px-2 rounded-lg inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="w-4 h-4" aria-hidden />
                  <span className="hidden sm:inline">{t('rep.del.button')}</span>
                </button>
              </span>
            </div>
          </div>
        </article>

        {/* What the Guide says */}
        <div className="min-w-0 lg:col-span-5 space-y-4">
          <ReportProblems treeId={report.treeId} reportId={report.id} caseIds={report.caseIds} />

          {guideOn && (
          <section className={card} aria-labelledby="rd-guide">
            <h2 id="rd-guide" className={`${h2} flex items-center gap-2`}>
              <BookOpen className="w-4 h-4 text-emerald-600" />
              {t('rep.detail.guide')}
            </h2>
            {topics.length === 0 ? (
              <p className="text-sm text-slate-600">
                {t('rep.detail.noTopics')}{' '}
                <Link to="/guide" className="font-semibold text-emerald-700 hover:underline">{t('rep.detail.browse')}</Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {topics.slice(0, 3).map((id) => {
                  const topic = TOPIC_BY_ID.get(id)!;
                  const Icon = TOPIC_ICON[id];
                  return (
                    <li key={id}>
                      <Link
                        to={`/guide/${id}`}
                        className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40"
                      >
                        <Icon className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-900">{pick(topic.title, lang)}</span>
                          <span className="block text-xs text-slate-600 mt-0.5">{pick(topic.summary, lang)}</span>
                        </span>
                        <ArrowRight className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {topics.length > 0 && (
              <Link to={`/reports?topic=${topics[0]}`} className="block text-xs font-semibold text-emerald-700 hover:underline">
                {t('rep.detail.similar', { topic: pick(TOPIC_BY_ID.get(topics[0])!.title, lang) })}
              </Link>
            )}
          </section>
          )}

          {block && (
            <section className={card} aria-labelledby="rd-season">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="rd-season" className={h2}>{t('rep.detail.blockNow', { block })}</h2>
                {stage && (
                  <span className="flex flex-wrap gap-1">
                    {stageIds.map((st) => (
                      <StagePill key={st} stage={st} />
                    ))}
                  </span>
                )}
              </div>
              {stage && season ? (
                <>
                  <p className="text-xs text-slate-600 tabular">{blockLine(season, t)}</p>
                  {tws.length > 0 && (tws.length > 1 || !tws[0].fromBlock) && (
                    <p className="text-xs text-slate-700">
                      {t('rep.detail.treeBlooms', {
                        id: report.treeId,
                        list: tws.map((w) => `${t('guide.season.day', { n: w.day })} (${w.fromBlock ? t('guide.tree.fromBlock', { block: block || '' }) : t(`guide.part.${w.part}`)})`).join(', '),
                      })}
                    </p>
                  )}
                  {guideOn && (
                  <ul className="space-y-1.5">
                    {actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-800">
                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                        <span>
                          {pick(a.text, lang)}{' '}
                          <Link to={`/guide/${a.topic}`} className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                            {pick(TOPIC_BY_ID.get(a.topic)!.title, lang)} →
                          </Link>
                          {a.task && <SeasonTaskChips task={a.task} seasons={[season]} />}
                        </span>
                      </li>
                    ))}
                  </ul>
                  )}
                </>
              ) : (
                <div className="text-sm text-slate-600 space-y-1.5">
                  <p>{t('guide.tree.noStage', { block })}</p>
                  <BloomQuickSet block={block} current={season?.floweredOn} />
                </div>
              )}
            </section>
          )}

          {tree && (
            <section className={card} aria-labelledby="rd-tree">
              <div className="flex items-center justify-between gap-2">
                <h2 id="rd-tree" className={h2}>{t('rep.detail.treeNow', { id: tree.id })}</h2>
                <ConditionBadge condition={tree.condition} improving={improvingNow(tree)} size="sm" />
              </div>
              {tree.conditionNotes && <p className="text-sm text-slate-700 line-clamp-3">{tree.conditionNotes}</p>}
              <Link to={treeUrl(tree.id)} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">
                {t('rep.detail.openTree')} <ArrowRight className="w-4 h-4" />
              </Link>
            </section>
          )}
        </div>
      </div>

      {otherReports.length > 0 && (
        <section aria-labelledby="rd-others" className="space-y-2.5">
          <h2 id="rd-others" className={h2}>{t('rep.detail.others', { id: report.treeId })}</h2>
          <RecordGrid>
            {otherReports.map((r) => (
              <RecordCard key={r.id} entry={reportEntry(r)} showTree={false} />
            ))}
          </RecordGrid>
        </section>
      )}

      {deleting && (
        <ReportDeleteSheet report={report} onClose={() => setDeleting(false)} onDeleted={() => navigate('/reports', { replace: true })} />
      )}
    </div>
  );
};

/** The records the bot filed from this report (a harvest, a count, a flowering), each opening its own page. */
const RECORD_OF: Record<string, 'harvest' | 'count' | 'bloom'> = { harvests: 'harvest', cropCounts: 'count', bloomWaves: 'bloom' };
const FiledRecords: React.FC<{ report: TreeReport }> = ({ report }) => {
  const { t } = useT();
  const links = (report.ai?.recorded || [])
    .map((p) => {
      const [col, ...rest] = p.split('/');
      const kind = RECORD_OF[col];
      return kind && rest.length ? { kind, key: `${kind}:${rest.join('/')}` } : null;
    })
    .filter((x): x is { kind: 'harvest' | 'count' | 'bloom'; key: string } => !!x);
  if (!links.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-slate-600">{t('feed.filed')}</span>
      {links.map((l) => (
        <Link key={l.key} to={`/reports/${encodeURIComponent(l.key)}`} className="font-semibold text-emerald-700 hover:underline">
          {t(`log.kind.${l.kind}`)}
        </Link>
      ))}
    </p>
  );
};

const StepLink: React.FC<{ report?: TreeReport; label: string }> = ({ report, label }) =>
  report ? (
    <Link
      to={`/reports/${encodeURIComponent(report.id)}`}
      replace
      onClick={() => rememberReport(report)}
      className="min-h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center"
    >
      {label}
    </Link>
  ) : null;

const Notice: React.FC<{ text: string }> = ({ text }) => {
  const { t } = useT();
  return (
    <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-3">
      <p className="text-sm text-slate-700">{text}</p>
      <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline">
        <ArrowLeft className="w-4 h-4" />
        {t('rep.detail.back')}
      </Link>
    </div>
  );
};
