import React, { useState } from 'react';
import { ArrowRight, Image as ImageIcon, User, ArrowRightLeft } from 'lucide-react';
import { ConditionBadge } from './ConditionBadge';
import { ReportDate } from './ReportDate';
import { Link } from './Link';
import { formatDateTime } from '../context/FarmContext';
import { treeUrl } from '../lib/router';
import { maskPhone } from '../lib/insights';
import type { DurianTree, ReportPhoto, TreeReport } from '../types';

/** True when the note has no letters or digits (e.g. only "🙏😎"). */
function hasWords(text?: string): boolean {
  return !!text && /[\p{L}\p{N}]/u.test(text);
}

const Thumb: React.FC<{
  photo: ReportPhoto;
  idx: number;
  total: number;
  big: boolean;
  caption: string;
  onOpen: (url: string, caption: string) => void;
}> = ({ photo, idx, total, big, caption, onOpen }) => {
  const [failed, setFailed] = useState(false);
  const size = big ? 'w-32 h-32 sm:w-44 sm:h-44' : 'w-24 h-24';
  return (
    <button
      type="button"
      onClick={() => onOpen(photo.url, caption)}
      aria-label={`Open photo ${idx + 1} of ${total}`}
      className={`relative ${size} rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 focus-visible:outline-2 focus-visible:outline-emerald-600 hover:ring-2 hover:ring-emerald-500 transition`}
    >
      {failed ? (
        <span className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-xs">
          <ImageIcon className="w-4 h-4 mb-0.5" />
          Photo {idx + 1}
        </span>
      ) : (
        <img
          src={photo.thumb || photo.url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
};

/**
 * One field report. Reads top to bottom as: which tree + how it is → what changed → what the worker
 * said → the evidence (photos) → who sent it.
 */
export const ReportCard: React.FC<{
  report: TreeReport;
  tree?: DurianTree;
  onOpenPhoto: (url: string, caption: string) => void;
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
      <div className="p-4 space-y-3">
       <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-5">
        <div className="flex-1 min-w-0 space-y-3">
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

        </div>

        {/* Evidence */}
        {photos.length > 0 && (
          <div className={`flex flex-wrap gap-2 sm:shrink-0 ${photos.length > 1 ? 'sm:w-[200px] sm:justify-end' : 'sm:justify-end'}`}>
            {photos.map((p, i) => (
              <Thumb
                key={i}
                photo={p}
                idx={i}
                total={photos.length}
                big={photos.length === 1}
                caption={`Tree ${report.treeId} · Photo ${i + 1} of ${photos.length} (${formatDateTime(report.createdAt)})`}
                onOpen={onOpenPhoto}
              />
            ))}
          </div>
        )}

       </div>

        {/* Source */}
        {phone && (
          <footer className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600">
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
    </article>
  );
};
