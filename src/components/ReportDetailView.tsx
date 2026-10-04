import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CalendarClock, CheckCircle2, Clock, Trash2, User } from 'lucide-react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db, parseReportDoc } from '../lib/firebase';
import { normalizeTimestamp, useFarm } from '../context/FarmContext';
import { goBack, navigate, treeUrl } from '../lib/router';
import { cachedReport, rememberReport } from '../lib/reportCache';
import { FOLLOW_UP_LIMIT_DAYS, maskPhone } from '../lib/insights';
import { STAGES, STAGE_ORDER, TOPIC_BY_ID, pick, topicsForText, treeStages } from '../lib/guide';
import { useSeasons } from './useSeasons';
import { useGuideOn } from '../lib/guideMode';
import { useT } from '../i18n';
import type { TreeReport } from '../types';
import { ConditionBadge } from './ConditionBadge';
import { ReportDate } from './ReportDate';
import { ReportCard, hasWords } from './ReportCard';
import { ReportDeleteSheet } from './ReportDeleteSheet';
import { PhotoAlbum } from './PhotoAlbum';
import { PhotoLightbox, photoItems, type GalleryItem } from './PhotoLightbox';
import { BloomQuickSet, StagePill, TOPIC_ICON, blockLine } from './GuideWidgets';
import { SeasonTaskChips } from './FieldRecords';
import { Link } from './Link';

const DAY = 24 * 60 * 60 * 1000;
const card = 'bg-white rounded-xl border border-slate-200 p-4 space-y-3';
const h2 = 'text-sm font-bold text-slate-900';

/**
 * One field report: everything the worker sent, and what the Guide says to do about it: the follow-up the
 * condition calls for, the Guide topics the note is about, and where the block is in its season.
 */
export const ReportDetailView: React.FC<{ reportId: string }> = ({ reportId }) => {
  const { t, lang, locale } = useT();
  const guideOn = useGuideOn();
  const { trees, variants, harvestCycles, treeBlooms } = useFarm();
  // Same style as ReportDate ("04 Oct 2026").
  const day = (v: any) => new Date(normalizeTimestamp(v)).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  const [report, setReport] = useState<TreeReport | null | undefined>(() => cachedReport(reportId));
  const [loadError, setLoadError] = useState(false);
  const [others, setOthers] = useState<TreeReport[]>([]);
  const [gallery, setGallery] = useState<{ items: GalleryItem[]; index: number } | null>(null);
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
  const phone = maskPhone(report.workerPhone);
  const last4 = (report.workerPhone || '').replace(/\D/g, '').slice(-4);
  const changed = report.conditionChanged && report.conditionBefore && report.conditionBefore !== report.conditionAfter;
  const variantName = variants.find((v) => v.code === tree?.variant)?.name || tree?.variant;
  const idx = others.findIndex((r) => r.id === report.id);
  const newer = idx > 0 ? others[idx - 1] : undefined;
  const older = idx >= 0 ? others[idx + 1] : undefined;
  const otherReports = others.filter((r) => r.id !== report.id).slice(0, 5);

  // Follow-up rule from the Guide: emergency re-checked within 2 days, minor within 7.
  const cond = (report.conditionAfter || '').toLowerCase();
  const limitDays = cond === 'emergency' ? FOLLOW_UP_LIMIT_DAYS.emergency : cond === 'minor' || cond === 'minor_issue' ? FOLLOW_UP_LIMIT_DAYS.minor : 0;
  // The first report on this tree after this one (others is newest first).
  const nextReport = [...others].reverse().find((r) => normalizeTimestamp(r.createdAt) > ts);
  const due = ts + limitDays * DAY;
  const followed = nextReport ? normalizeTimestamp(nextReport.createdAt) : 0;

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

      <div className="grid gap-4 lg:grid-cols-12">
        {/* The report */}
        <article className={`lg:col-span-7 bg-white rounded-xl border overflow-hidden ${cond === 'emergency' ? 'border-rose-300 border-l-4 border-l-rose-500' : 'border-slate-200'}`}>
          <div className="p-4 sm:p-5 space-y-3">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-900">
                  <Link to={treeUrl(report.treeId)} className="hover:text-emerald-700 hover:underline underline-offset-2">
                    {t('rep.treeN', { id: report.treeId })}
                  </Link>
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  {[variantName, block ? t('common.blockN', { n: block }) : null].filter(Boolean).join(' · ') || t('rep.unknownLocation')}
                </p>
              </div>
              {report.conditionAfter && <ConditionBadge condition={report.conditionAfter} />}
            </header>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-600">
              <ReportDate value={report.createdAt} />
              <span className="tabular">{new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            {changed && (
              <p className="flex flex-wrap items-center gap-1.5 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 font-medium">
                {t('cond.changed')}:
                <ConditionBadge condition={report.conditionBefore!} size="sm" />
                <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                <ConditionBadge condition={report.conditionAfter || 'not_assessed'} size="sm" />
              </p>
            )}

            <div>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">{t('rep.detail.note')}</h2>
              {hasWords(report.description) ? (
                <p className="text-base text-slate-900 leading-relaxed whitespace-pre-line">{report.description}</p>
              ) : (
                <p className="text-sm text-slate-500">
                  {report.description?.trim() ? `${t('rep.noNote')} ${report.description.trim()}` : t('rep.noNote.dot')}
                </p>
              )}
            </div>
          </div>

          {photos.length > 0 && (
            <PhotoAlbum
              photos={photos}
              eager
              onOpen={(i) => setGallery({ items: photoItems(photos, report.treeId, report.createdAt), index: i })}
              className="aspect-[4/3] sm:aspect-[16/10]"
            />
          )}

          <footer className="px-4 sm:px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              {phone && (
                <span className="inline-flex items-center gap-1.5">
                  <User className="w-4 h-4 text-slate-400" aria-hidden />
                  {t('rep.reportedBy')} <span className="font-mono">{phone}</span>
                </span>
              )}
              {last4 && (
                <Link to={`/reports?q=${last4}`} className="font-semibold text-emerald-700 hover:underline min-h-9 inline-flex items-center">
                  {t('rep.allFromWorker')}
                </Link>
              )}
            </span>
            <button
              type="button"
              onClick={() => setDeleting(true)}
              className="min-h-10 px-2.5 -mr-2 rounded-lg inline-flex items-center gap-1.5 font-semibold text-slate-500 hover:text-rose-700 hover:bg-rose-50"
            >
              <Trash2 className="w-4 h-4" aria-hidden />
              {t('rep.del.button')}
            </button>
          </footer>
        </article>

        {/* What the Guide says */}
        <div className="lg:col-span-5 space-y-4">
          {limitDays > 0 && (
            <section className={card} aria-labelledby="rd-fu">
              <h2 id="rd-fu" className={`${h2} flex items-center gap-2`}>
                <CalendarClock className="w-4 h-4 text-emerald-600" />
                {t('rep.detail.followUp')}
              </h2>
              <p className="text-sm text-slate-700">{t('rep.detail.followRule', { n: limitDays })}</p>
              {followed ? (
                <p className="flex items-start gap-2 text-sm text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {t(followed - ts <= limitDays * DAY ? 'rep.detail.followedOnTime' : 'rep.detail.followedLate', { date: day(nextReport!.createdAt) })}{' '}
                    <Link to={`/reports/${encodeURIComponent(nextReport!.id)}`} className="font-semibold underline underline-offset-2">
                      {t('rep.detail.openNext')}
                    </Link>
                  </span>
                </p>
              ) : (
                <p className={`flex items-start gap-2 text-sm ${Date.now() > due ? 'text-rose-700 font-semibold' : 'text-amber-800'}`}>
                  <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                  {Date.now() > due
                    ? t('rep.detail.overdue', { date: day(due), n: Math.floor((Date.now() - due) / DAY) })
                    : t('rep.detail.dueBy', { date: day(due) })}
                </p>
              )}
            </section>
          )}

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
                <ConditionBadge condition={tree.condition} size="sm" />
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
          <div className="grid gap-3 md:grid-cols-2">
            {otherReports.map((r) => (
              <ReportCard key={r.id} report={r} tree={tree} showTree={false} size="sm" />
            ))}
          </div>
        </section>
      )}

      {gallery && <PhotoLightbox items={gallery.items} index={gallery.index} onClose={() => setGallery(null)} />}
      {deleting && (
        <ReportDeleteSheet report={report} onClose={() => setDeleting(false)} onDeleted={() => navigate('/reports', { replace: true })} />
      )}
    </div>
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
