import React, { useMemo } from 'react';
import { ArrowRightLeft, BookOpen, Camera, User } from 'lucide-react';
import { ConditionBadge } from './ConditionBadge';
import { ReportReading } from './FieldStage';
import { ActionChips } from './ReportFindings';
import { ReportDate } from './ReportDate';
import { Link } from './Link';
import { reportUrl, treeUrl } from '../lib/router';
import { useFarm } from '../context/FarmContext';
import { rememberReport } from '../lib/reportCache';
import { formatDate } from '../context/FarmContext';
import { useT } from '../i18n';
import { TOPIC_BY_ID, pick, topicsForText } from '../lib/guide';
import { useGuideOn } from '../lib/guideMode';
import type { DurianTree, TreeReport } from '../types';

/** True when the note has no letters or digits (e.g. only "🙏😎"). */
export function hasWords(text?: string): boolean {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

/**
 * One field report, the same everywhere (Reports feed, Dashboard, tree page, report page):
 *
 *   Tree A1 · MK · Block A                 [condition]
 *   02 Oct 2026 (2h ago) · ••••2789
 *   ⇄ Was Healthy                          (only when the condition changed)
 *   Worker's note, clamped                 [photo +N]
 *   Gemini's summary of the photos          (when it read them)
 *   ✓ Telor · Hawar daun                   (checked stage/issues, or the system's suggestion)
 *   🩺 Kerok & oles batang                   (work the worker did)
 *   📖 Guide topics the note mentions
 *
 * The whole card opens the report page; only the tree name goes to the tree instead.
 */
export const ReportCard: React.FC<{
  report: TreeReport;
  tree?: DurianTree;
  /** Hide the tree name where every card is the same tree (the tree page). */
  showTree?: boolean;
  /** sm = dense lists (Dashboard, tree page); md = the Reports feed. */
  size?: 'sm' | 'md';
  /** First cards on screen: load the photo immediately. */
  eager?: boolean;
}> = ({ report, tree, showTree = true, size = 'md', eager }) => {
  const { t, lang } = useT();
  const photos = report.photos || [];
  const photo = photos[0];
  const block = report.block || tree?.block;
  const worded = hasWords(report.description);
  const reaction = !worded && report.description?.trim() ? report.description.trim() : '';
  const { workerLabel } = useFarm();
  const phone = workerLabel(report.workerPhone);
  const emergency = (report.conditionAfter || '').toLowerCase() === 'emergency';
  const changed = report.conditionChanged && report.conditionBefore && report.conditionBefore !== report.conditionAfter;
  const guideOn = useGuideOn();
  const topics = useMemo(() => (guideOn ? topicsForText(report.description).slice(0, 2) : []), [report.description, guideOn]);
  const sm = size === 'sm';
  const where = [tree?.variant, block ? t('common.blockN', { n: block }) : null].filter(Boolean).join(' · ');

  return (
    <article
      className={`relative bg-white rounded-xl border transition-colors hover:border-slate-400 focus-within:border-emerald-500 ${
        emergency ? 'border-rose-300 border-l-4 border-l-rose-500' : 'border-slate-200'
      }`}
    >
      {/* Stretched link: the whole card opens the report. Inner links sit above it (relative z-10). */}
      <Link
        to={reportUrl(report.id)}
        onClick={() => rememberReport(report)}
        aria-label={t('rep.card.open', { id: report.treeId, date: formatDate(report.createdAt) })}
        className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      />
      <div className={`flex gap-3 ${sm ? 'p-3' : 'p-4'}`}>
        <div className="min-w-0 flex-1 space-y-1.5">
          <header className="flex items-start justify-between gap-2">
            {showTree ? (
              <p className="min-w-0">
                <Link
                  to={treeUrl(report.treeId)}
                  className={`relative z-10 font-bold text-slate-900 hover:text-emerald-700 hover:underline underline-offset-2 ${sm ? 'text-sm' : 'text-base'}`}
                >
                  {t('rep.treeN', { id: report.treeId })}
                </Link>
                <span className="ml-1.5 text-xs text-slate-500">{where || t('rep.unknownLocation')}</span>
              </p>
            ) : (
              <ReportDate value={report.createdAt} />
            )}
            {report.conditionAfter && <ConditionBadge condition={report.conditionAfter} size="sm" />}
          </header>

          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {showTree && <ReportDate value={report.createdAt} />}
            {phone && (
              <span className={`inline-flex items-center gap-1 ${phone.startsWith('••••') ? 'font-mono' : ''}`}>
                <User className="w-3 h-3" aria-hidden />
                {phone}
              </span>
            )}
          </p>

          {changed && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
              <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden />
              {t('rep.changedWas')}
              <ConditionBadge condition={report.conditionBefore!} size="sm" />
            </p>
          )}

          {worded ? (
            <p className={`text-sm text-slate-800 leading-relaxed whitespace-pre-line ${sm ? 'line-clamp-2' : 'line-clamp-3'}`}>
              {report.description}
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              {reaction ? (
                <>
                  {t('rep.noNote')} <span className="ml-1 text-base" aria-label={t('rep.reaction')}>{reaction}</span>
                </>
              ) : photos.length === 0 ? (
                t('rep.statusOnly')
              ) : (
                t('rep.noNote.dot')
              )}
            </p>
          )}

          {report.triage?.source === 'ai' && report.triage.summary && (
            <p className={`text-xs text-slate-600 ${sm ? 'line-clamp-2' : 'line-clamp-3'}`}>{report.triage.summary}</p>
          )}
          <ReportReading report={report} />
          <ActionChips report={report} />

          {topics.length > 0 && (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-emerald-700">
              {topics.map((id) => (
                <span key={id} className="inline-flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" aria-hidden />
                  {pick(TOPIC_BY_ID.get(id)!.title, lang)}
                </span>
              ))}
            </p>
          )}
        </div>

        {photo && (
          <span className={`relative shrink-0 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 ${sm ? 'w-16 h-16' : 'w-20 h-20 sm:w-28 sm:h-28'}`}>
            <img
              src={photo.thumb || photo.medium || photo.url}
              alt=""
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            {photos.length > 1 && (
              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-slate-950/70 text-white text-[11px] font-semibold inline-flex items-center gap-0.5">
                <Camera className="w-3 h-3" aria-hidden />
                {photos.length}
              </span>
            )}
          </span>
        )}
      </div>
    </article>
  );
};
