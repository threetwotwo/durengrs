import React, { useState } from 'react';
import { ArrowRight, Image as ImageIcon, User, ArrowRightLeft } from 'lucide-react';
import { ConditionBadge } from './ConditionBadge';
import { ReportDate } from './ReportDate';
import { Link } from './Link';
import { treeUrl } from '../lib/router';
import { maskPhone } from '../lib/insights';
import { photoItems, type GalleryItem } from './PhotoLightbox';
import { PhotoAlbum } from './PhotoAlbum';
import type { DurianTree, ReportPhoto, TreeReport } from '../types';

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
}> = ({ report, tree, onOpenPhoto, workerHref }) => {
  const photos = report.photos || [];
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
            onOpen={(i) => onOpenPhoto(photoItems(photos, report.treeId, report.createdAt), i)}
            className="aspect-[4/3] md:aspect-auto md:order-last md:w-[46%] md:shrink-0 md:min-h-[260px]"
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
              Tree {report.treeId}
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition" />
            </Link>
            <p className="text-sm text-slate-600 mt-0.5">
              {[tree?.variant, block ? `Block ${block}` : null].filter(Boolean).join(' · ') || 'Unknown location'}
            </p>
          </div>
          {report.conditionAfter && <ConditionBadge condition={report.conditionAfter} size="sm" />}
        </header>

        <ReportDate value={report.createdAt} />

        {report.conditionChanged && report.conditionBefore && report.conditionBefore !== report.conditionAfter && (
          <p className="flex items-center gap-2 text-xs font-medium text-amber-900">
            <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden />
            Condition changed. Was
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
                No written note <span className="ml-1 text-base" aria-label="Worker reaction">{reaction}</span>
              </>
            ) : noContent ? (
              'Status update only. No note or photos were sent.'
            ) : (
              'No written note.'
            )}
          </p>
        )}

        {/* Source */}
        {phone && (
          <footer className="mt-auto pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" aria-hidden />
              Reported by <span className="font-mono">{phone}</span>
            </span>
            {workerHref && (
              <Link to={workerHref} replace className="font-semibold text-emerald-700 hover:underline min-h-8 inline-flex items-center">
                All from this worker
              </Link>
            )}
          </footer>
        )}
        </div>
      </div>
    </article>
  );
};
