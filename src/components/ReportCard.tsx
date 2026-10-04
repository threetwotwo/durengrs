import React, { useMemo } from 'react';
import { ArrowRight, BookOpen, Trash2, User, ArrowRightLeft } from 'lucide-react';
import { ConditionBadge } from './ConditionBadge';
import { ReportDate } from './ReportDate';
import { Link } from './Link';
import { treeUrl } from '../lib/router';
import { maskPhone } from '../lib/insights';
import { useT } from '../i18n';
import { photoItems, type GalleryItem } from './PhotoLightbox';
import { PhotoAlbum } from './PhotoAlbum';
import { TOPIC_BY_ID, pick, topicsForText } from '../lib/guide';
import type { DurianTree, TreeReport } from '../types';

/** True when the note has no letters or digits (e.g. only "🙏😎"). */
function hasWords(text?: string): boolean {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

/**
 * One field report. Reads top to bottom as: which tree + how it is → what changed → what the worker
 * said → the evidence (photos) → who sent it.
 */
export const ReportCard: React.FC<{
  report: TreeReport;
  tree?: DurianTree;
  onOpenPhoto: (items: GalleryItem[], index: number) => void;
  /** Hide the "reports from this worker" link where it would not make sense. */
  workerHref?: string;
  /** First cards on screen: load photos immediately. */
  eager?: boolean;
  /** Shows a delete button; the parent confirms and deletes. */
  onDelete?: (report: TreeReport) => void;
}> = ({ report, tree, onOpenPhoto, workerHref, eager, onDelete }) => {
  const { t, lang } = useT();
  const photos = report.photos || [];
  // What the Guide says about what the worker described (e.g. "getah" -> Canker & rot); the two best matches.
  const topics = useMemo(() => topicsForText(report.description).slice(0, 2), [report.description]);
  const block = report.block || tree?.block;
  const worded = hasWords(report.description);
  const reaction = !worded && report.description?.trim() ? report.description.trim() : '';
  const phone = maskPhone(report.workerPhone);
  const emergency = (report.conditionAfter || '').toLowerCase() === 'emergency';
  const noContent = !worded && !reaction && photos.length === 0;

  return (
    <article
      className={`bg-white rounded-xl border shadow-xs overflow-hidden ${emergency ? 'border-rose-300' : 'border-slate-200'}`}
    >
      {emergency && <div className="h-1 bg-rose-500" aria-hidden />}
      <div className="flex flex-col md:flex-row">
        {photos.length > 0 && (
          <PhotoAlbum
            photos={photos}
            eager={eager}
            onOpen={(i) => onOpenPhoto(photoItems(photos, report.treeId, report.createdAt), i)}
            className="aspect-[4/5] sm:aspect-square md:aspect-auto md:order-last md:w-[46%] md:shrink-0 md:min-h-[340px]"
          />
        )}
        <div className="flex-1 min-w-0 p-4 flex flex-col gap-3">
        {/* Who + how */}
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={treeUrl(report.treeId)}
              className="group inline-flex items-center gap-1.5 text-base font-bold text-slate-900 hover:text-emerald-700"
            >
              {t('rep.treeN', { id: report.treeId })}
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition" />
            </Link>
            <p className="text-sm text-slate-600 mt-0.5">
              {[tree?.variant, block ? t('common.blockN', { n: block }) : null].filter(Boolean).join(' · ') || t('rep.unknownLocation')}
            </p>
          </div>
          {report.conditionAfter && <ConditionBadge condition={report.conditionAfter} size="sm" />}
        </header>

        <ReportDate value={report.createdAt} />

        {report.conditionChanged && report.conditionBefore && report.conditionBefore !== report.conditionAfter && (
          <p className="flex items-center gap-2 text-xs font-medium text-amber-900">
            <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden />
            {t('rep.changedWas')}
            <ConditionBadge condition={report.conditionBefore} size="sm" />
          </p>
        )}

        {/* Worker note */}
        {worded ? (
          <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line border-l-2 border-slate-300 pl-3">
            {report.description}
          </p>
        ) : (
          <p className="text-sm text-slate-500">
            {reaction ? (
              <>
                {t('rep.noNote')} <span className="ml-1 text-base" aria-label={t('rep.reaction')}>{reaction}</span>
              </>
            ) : noContent ? (
              t('rep.statusOnly')
            ) : (
              t('rep.noNote.dot')
            )}
          </p>
        )}

        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {topics.map((id) => (
              <Link
                key={id}
                to={`/guide/${id}`}
                className="min-h-8 px-2.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold inline-flex items-center gap-1"
              >
                <BookOpen className="w-3.5 h-3.5" aria-hidden />
                {pick(TOPIC_BY_ID.get(id)!.title, lang)}
              </Link>
            ))}
          </div>
        )}

        {/* Source + actions */}
        {(phone || onDelete) && (
          <footer className="mt-auto pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600">
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              {phone && (
                <span className="inline-flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" aria-hidden />
                  {t('rep.reportedBy')} <span className="font-mono">{phone}</span>
                </span>
              )}
              {workerHref && (
                <Link to={workerHref} replace className="font-semibold text-emerald-700 hover:underline min-h-8 inline-flex items-center">
                  {t('rep.allFromWorker')}
                </Link>
              )}
            </span>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(report)}
                className="min-h-10 px-2.5 -mr-2 rounded-lg inline-flex items-center gap-1.5 font-semibold text-slate-500 hover:text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="w-4 h-4" aria-hidden />
                {t('rep.del.button')}
              </button>
            )}
          </footer>
        )}
        </div>
      </div>
    </article>
  );
};
