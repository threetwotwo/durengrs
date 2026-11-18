import React from 'react';
import { Camera, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useT } from '../i18n';
import type { Criterion } from '../lib/grading';
import type { ReportPhoto } from '../types';
import { btnSecondary } from './PageHeader';

export const fmtScore = (v: number | undefined) => (v === undefined ? '' : String(Math.round(v * 100) / 100));

/**
 * One criterion's slider, 1-5 in halves: its name and weight, its scale (5 = the first word), the score in a box
 * coloured by it (red below 2.5, amber to 3.5, green from 4; grey until scored), × to clear it.
 */
export const ScoreSlider: React.FC<{ c: Criterion; v: number | undefined; set: (n: number | undefined) => void; big?: boolean }> = ({ c, v, set, big }) => {
  const { t } = useT();
  const accent = v === undefined ? '#cbd5e1' : v >= 4 ? '#059669' : v >= 2.5 ? '#f59e0b' : '#e11d48';
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`${big ? 'text-base' : 'text-sm'} font-semibold text-slate-900`}>
          {t(`qc.c.${c.key}`)} <span className="text-xs font-normal text-slate-500">{c.weight}%</span>
        </span>
        <span className="text-[11px] text-slate-500 text-right">{t(`qc.c.${c.key}.scale`)}</span>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <input
            type="range"
            min={1}
            max={5}
            step={0.5}
            value={v ?? 3}
            aria-label={t(`qc.c.${c.key}`)}
            aria-valuetext={v === undefined ? t('qc.unscored') : fmtScore(v)}
            onChange={(e) => set(Number(e.currentTarget.value))}
            // A tap on an unscored slider takes the value where it sits (3), as a drag would.
            onPointerUp={(e) => v === undefined && set(Number(e.currentTarget.value))}
            onKeyUp={(e) => v === undefined && set(Number(e.currentTarget.value))}
            className={`w-full h-8 cursor-pointer ${v === undefined ? 'opacity-50' : ''}`}
            style={{ accentColor: accent }}
          />
          <div className="flex justify-between px-[6px] text-[10px] text-slate-400 tabular select-none" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </div>
        <span
          className={`w-12 shrink-0 text-center rounded-lg py-1.5 text-base font-bold tabular ${v === undefined ? 'text-slate-400 bg-slate-50 border border-dashed border-slate-300' : 'text-white'}`}
          style={v === undefined ? undefined : { background: accent }}
        >
          {v === undefined ? '–' : fmtScore(v)}
        </span>
        <button
          type="button"
          onClick={() => set(undefined)}
          disabled={v === undefined}
          aria-label={t('qc.clear', { c: t(`qc.c.${c.key}`) })}
          className="w-7 h-7 shrink-0 rounded-full text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:invisible"
        >
          ×
        </button>
      </div>
    </div>
  );
};

/** Photos of the opened fruit: from the camera or the gallery, uploaded as picked, each removable. */
export const QcPhotos: React.FC<{
  photos: ReportPhoto[];
  setPhotos: (f: (p: ReportPhoto[]) => ReportPhoto[]) => void;
  uploading: number;
  setUploading: (f: (n: number) => number) => void;
  tree: string;
  name: string;
  onChange?: () => void;
}> = ({ photos, setPhotos, uploading, setUploading, tree, name, onChange }) => {
  const { t } = useT();
  const [error, setError] = React.useState(false);
  const add = async (list: File[]) => {
    if (!list.length) return;
    const { uploadTreePhoto } = await import('../lib/photoUpload');
    for (const file of list) {
      setUploading((n) => n + 1);
      setError(false);
      try {
        const up = await uploadTreePhoto(file, tree || 'tree', `${name}-${Date.now()}`, 'qc-photos');
        setPhotos((p) => [...p, { url: up.url, medium: up.medium, thumb: up.thumb }]);
        onChange?.();
      } catch (e) {
        console.error('Grading photo upload failed:', e);
        setError(true);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };
  return (
    <div>
      <span className="text-sm font-semibold text-slate-800">{t('qc.photos')}</span>
      <div className="mt-1 flex items-center gap-2 flex-wrap">
        {(['camera', 'gallery'] as const).map((src) => (
          <label key={src} className={`${btnSecondary} cursor-pointer`}>
            {src === 'camera' ? <Camera className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
            {t(src === 'camera' ? 'qc.photoAdd' : 'qc.photoGallery')}
            <input
              type="file"
              accept="image/*"
              {...(src === 'camera' ? { capture: 'environment' as const } : { multiple: true })}
              className="sr-only"
              onChange={(e) => {
                // Copied before the input is reset: resetting it empties its FileList.
                const list = Array.from(e.target.files || []);
                e.target.value = '';
                add(list);
              }}
            />
          </label>
        ))}
        {uploading > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('qc.photoUploading')}
          </span>
        )}
        {photos.map((ph, i) => (
          <span key={ph.url} className="relative">
            <img src={ph.thumb || ph.medium || ph.url} alt="" className="w-14 h-14 rounded-md object-cover border border-slate-200" />
            <button
              type="button"
              aria-label={t('qc.photoRemove', { i: i + 1 })}
              onClick={() => {
                setPhotos((p) => p.filter((x) => x.url !== ph.url));
                onChange?.();
              }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-white text-xs leading-5"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-rose-700">{t('qc.photoError')}</p>}
    </div>
  );
};
