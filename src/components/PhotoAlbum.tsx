import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { ReportPhoto } from '../types';
import { useT } from '../i18n';

const Tile: React.FC<{
  photo: ReportPhoto;
  index: number;
  total: number;
  className?: string;
  more?: number;
  eager?: boolean;
  onOpen: (index: number) => void;
}> = ({ photo, index, total, className = '', more, eager, onOpen }) => {
  const { t } = useT();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Three sizes: thumb (320px) is shown blurred at once, medium (900px) replaces it, and the full
  // 1600px photo is only fetched by the viewer. Older reports without a medium copy use the full one.
  const sharp = photo.medium || photo.url;
  const placeholder = photo.thumb && photo.thumb !== sharp ? photo.thumb : undefined;

  // Already in the browser cache: show it immediately instead of fading in.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setReady(true);
  }, [sharp]);

  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={t('photo.openNth', { i: index + 1, n: total })}
      className={`relative overflow-hidden bg-slate-200 group focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 ${className}`}
    >
      {failed ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs">
          <ImageIcon className="w-5 h-5 mb-1" />
          {t('photo.nth', { n: index + 1 })}
        </span>
      ) : (
        <>
          {placeholder && (
            <img
              src={placeholder}
              alt=""
              aria-hidden
              decoding="async"
              referrerPolicy="no-referrer"
              className={`absolute inset-0 w-full h-full object-cover scale-110 blur-lg ${ready ? 'opacity-0' : 'opacity-100'}`}
            />
          )}
          <img
            ref={imgRef}
            src={sharp}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : undefined}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setReady(true)}
            onError={() => setFailed(true)}
            className={`absolute inset-0 w-full h-full object-cover ${ready ? 'opacity-100' : 'opacity-0'}`}
          />
        </>
      )}
      {more ? (
        <span className="absolute inset-0 bg-slate-950/55 text-white text-2xl font-bold flex items-center justify-center">
          +{more}
        </span>
      ) : null}
    </button>
  );
};

/**
 * Photos of one report as an album that fills its container (give the parent a height or aspect ratio):
 * 1 photo = full, 2 = side by side, 3 = one large + two stacked, 4+ = 2x2 with a "+N" on the last tile.
 */
export const PhotoAlbum: React.FC<{
  photos: ReportPhoto[];
  onOpen: (index: number) => void;
  className?: string;
  /** Load right away (first cards on the page) instead of waiting until scrolled near. */
  eager?: boolean;
}> = ({ photos, onOpen, className = '', eager }) => {
  const n = photos.length;
  if (n === 0) return null;
  const shown = photos.slice(0, 4);
  const more = n > 4 ? n - 3 : 0; // the 4th tile shows "+N" for everything not visible
  const layout =
    n === 1 ? 'grid-cols-1 grid-rows-1' : n === 2 ? 'grid-cols-2 grid-rows-1' : 'grid-cols-2 grid-rows-2';

  return (
    <div className={`grid gap-0.5 bg-white ${layout} ${className}`}>
      {shown.map((p, i) => (
        <Tile
          key={i}
          photo={p}
          index={i}
          total={n}
          onOpen={onOpen}
          eager={eager}
          more={i === 3 ? more : 0}
          className={n === 3 && i === 0 ? 'row-span-2' : ''}
        />
      ))}
    </div>
  );
};
