import React, { useState } from 'react';
import type { ReportPhoto } from '../types';
import { useT } from '../i18n';
import { PhotoLightbox } from './PhotoLightbox';

/** Small thumbnails of the photos sent with a record; tap one to open the viewer. */
export function PhotoStrip({ photos, caption }: { photos?: ReportPhoto[]; caption: string }) {
  const { t } = useT();
  const [index, setIndex] = useState<number | null>(null);
  if (!photos || photos.length === 0) return null;
  return (
    <>
      <span className="mt-1.5 flex gap-1.5">
        {photos.map((ph, i) => (
          <button
            key={ph.url}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={t('photo.strip.n', { i: i + 1, n: photos.length })}
            className="w-12 h-12 rounded-md overflow-hidden border border-slate-200 bg-slate-100"
          >
            <img src={ph.thumb || ph.medium || ph.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          </button>
        ))}
      </span>
      {index !== null && (
        <PhotoLightbox
          items={photos.map((ph, i) => ({ url: ph.url, medium: ph.medium, thumb: ph.thumb, caption: `${caption} (${i + 1}/${photos.length})` }))}
          index={index}
          onClose={() => setIndex(null)}
        />
      )}
    </>
  );
}
