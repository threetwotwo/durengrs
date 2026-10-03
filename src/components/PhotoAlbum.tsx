import React, { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { ReportPhoto } from '../types';
import { useT } from '../i18n';

const Tile: React.FC<{
  photo: ReportPhoto;
  index: number;
  total: number;
  className?: string;
  more?: number;
  onOpen: (index: number) => void;
}> = ({ photo, index, total, className = '', more, onOpen }) => {
  const { t } = useT();
  const [failed, setFailed] = useState(false);
  const [fullReady, setFullReady] = useState(false);
  const [fullFailed, setFullFailed] = useState(false);
  // Show the small thumbnail straight away, then fade the full photo in over it once it has loaded.
  const base = photo.thumb || photo.url;
  const hasThumb = !!photo.thumb && photo.thumb !== photo.url;
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
          <img
            src={base}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
          {hasThumb && !fullFailed && (
            <img
              src={photo.url}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() => setFullReady(true)}
              onError={() => setFullFailed(true)}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 group-hover:scale-[1.03] ${fullReady ? 'opacity-100' : 'opacity-0'}`}
            />
          )}
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
}> = ({ photos, onOpen, className = '' }) => {
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
          more={i === 3 ? more : 0}
          className={n === 3 && i === 0 ? 'row-span-2' : ''}
        />
      ))}
    </div>
  );
};
