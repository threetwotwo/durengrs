import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, ExternalLink, Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateTime } from '../context/FarmContext';
import type { ReportPhoto } from '../types';

export interface GalleryItem {
  url: string;
  caption?: string;
}

/** Builds gallery items for the photos of one report. */
export function photoItems(photos: ReportPhoto[], treeId: string, date: any): GalleryItem[] {
  return photos.map((p, i) => ({
    url: p.url,
    caption: `Tree ${treeId} · Photo ${i + 1} of ${photos.length} (${formatDateTime(date)})`,
  }));
}

interface PhotoLightboxProps {
  items: GalleryItem[];
  index?: number;
  onClose: () => void;
}

/** Full-screen photo viewer with previous/next, keyboard arrows, swipe, dots and zoom. */
export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({ items, index = 0, onClose }) => {
  const [i, setI] = useState(Math.min(Math.max(index, 0), Math.max(items.length - 1, 0)));
  const [scale, setScale] = useState(1);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const touchX = useRef<number | null>(null);
  const count = items.length;

  const go = useCallback(
    (d: number) => {
      if (count < 2) return;
      setI((cur) => (cur + d + count) % count);
      setScale(1);
    },
    [count]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  const item = items[i];
  if (!item) return null;

  const navBtn = 'p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors focus-visible:outline-2 focus-visible:outline-white';
  const toolBtn = 'p-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col p-3 sm:p-4"
      onClick={onClose}
    >
      <div className="flex items-center justify-between text-white py-1 px-1 sm:px-4 max-w-5xl mx-auto w-full" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-semibold tabular-nums" aria-live="polite">
          {count > 1 ? `${i + 1} / ${count}` : 'Photo'}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => setScale((s) => Math.min(s + 0.3, 3))} className={toolBtn} title="Zoom in" aria-label="Zoom in">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => setScale((s) => Math.max(s - 0.3, 0.7))} className={toolBtn} title="Zoom out" aria-label="Zoom out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className={toolBtn} title="Open original" aria-label="Open original">
            <ExternalLink className="w-4 h-4" />
          </a>
          <button onClick={onClose} className="p-2.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white ml-2" title="Close" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 min-h-0 flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        {count > 1 && (
          <button onClick={() => go(-1)} className={`${navBtn} absolute left-0 sm:left-2 z-10`} aria-label="Previous photo">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {failed[i] ? (
          <div className="flex flex-col items-center p-8 bg-slate-900 border border-slate-800 rounded-xl text-slate-400">
            <ImageIcon className="w-12 h-12 text-slate-600 mb-2" />
            <p className="text-sm font-medium">Could not load this photo</p>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-3 text-sm text-emerald-400 underline">
              Open it directly
            </a>
          </div>
        ) : (
          <img
            key={i}
            src={item.url}
            alt={item.caption || 'Inspection photo'}
            onError={() => setFailed((f) => ({ ...f, [i]: true }))}
            style={{ transform: `scale(${scale})`, transition: 'transform 0.2s ease-out' }}
            className="max-h-full max-w-full object-contain rounded-md shadow-2xl select-none"
            draggable={false}
          />
        )}

        {count > 1 && (
          <button onClick={() => go(1)} className={`${navBtn} absolute right-0 sm:right-2 z-10`} aria-label="Next photo">
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* preload the neighbours so stepping feels instant */}
      {count > 1 && (
        <div className="hidden" aria-hidden>
          <img src={items[(i + 1) % count].url} alt="" />
          <img src={items[(i - 1 + count) % count].url} alt="" />
        </div>
      )}

      <div className="pt-2 pb-1 text-center max-w-xl mx-auto" onClick={(e) => e.stopPropagation()}>
        {item.caption && <p className="text-xs text-slate-300">{item.caption}</p>}
        {count > 1 && (
          <div className="flex justify-center gap-1 mt-2" role="tablist" aria-label="Choose photo">
            {items.map((_, d) => (
              <button
                key={d}
                role="tab"
                aria-selected={d === i}
                aria-label={`Photo ${d + 1}`}
                onClick={() => {
                  setI(d);
                  setScale(1);
                }}
                className="p-2 -m-0.5"
              >
                <span className={`block h-2 rounded-full transition-all ${d === i ? 'w-5 bg-white' : 'w-2 bg-white/40'}`} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
