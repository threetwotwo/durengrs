import React, { useState } from 'react';
import { CameraOff, CloudRain, Flower2, ListChecks, Ruler, Wheat, ClipboardList } from 'lucide-react';
import { useFarm, normalizeTimestamp } from '../context/FarmContext';
import { useT } from '../i18n';
import { rememberReport } from '../lib/reportCache';
import { type LogEntry, type LogKind } from '../lib/fieldLog';
import { hasWords, reportTags, reportValues, type Tag, type TagTone } from '../lib/feed';
import { GRADES } from '../lib/fieldData';
import { SEASON_TASKS } from '../lib/fieldInsights';
import { pick } from '../lib/guide';
import { treeUrl } from '../lib/router';
import type { ReportPhoto } from '../types';
import { Link } from './Link';
import { PhotoLightbox, type GalleryItem } from './PhotoLightbox';
import { FIELD_KEY, TEXT_FIELDS, recordUrl, useEditValue } from './LogParts';

/**
 * One look for every record from the field, wherever it is listed (Reports, Today, a tree's history, a problem's
 * history): the photos first, then the tree, what it says in a line or two, and a few plain tags. A harvest, count
 * or flowering the bot filed from a report shows on that report (lib/feed.ts foldFiledRecords), never twice.
 */

// ---------- tags ----------

const TAG_TONE: Record<TagTone, string> = {
  green: 'bg-emerald-50 text-emerald-800',
  yellow: 'bg-amber-50 text-amber-900',
  red: 'bg-rose-100 text-rose-800',
  problem: 'bg-rose-50 text-rose-800',
  work: 'bg-sky-50 text-sky-800',
  plain: 'bg-slate-100 text-slate-700',
};
const DOT: Partial<Record<TagTone, string>> = { green: 'bg-emerald-500', yellow: 'bg-amber-500', red: 'bg-rose-600' };

export const Tags: React.FC<{ tags: Tag[]; className?: string }> = ({ tags, className = '' }) =>
  tags.length ? (
    <ul className={`flex flex-wrap gap-1 ${className}`}>
      {tags.map((g) => (
        <li key={g.key} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${TAG_TONE[g.tone]}`}>
          {DOT[g.tone] && <span className={`w-1.5 h-1.5 rounded-full ${DOT[g.tone]}`} aria-hidden />}
          {g.label}
        </li>
      ))}
    </ul>
  ) : null;

// ---------- photos ----------

/**
 * The photos of a record, large: one fills the frame, two side by side, three or more as one large and two small
 * (with "+N" for the rest). Tapping opens the viewer.
 */
export const PhotoGrid: React.FC<{ photos: ReportPhoto[]; caption: string; eager?: boolean; className?: string }> = ({ photos, caption, eager, className = '' }) => {
  const { t } = useT();
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  const shown = photos.slice(0, 3);
  const more = photos.length - shown.length;
  const layout = shown.length === 1 ? 'grid-cols-1' : shown.length === 2 ? 'grid-cols-2' : 'grid-cols-3 grid-rows-2';
  const items: GalleryItem[] = photos.map((p, i) => ({ url: p.url, medium: p.medium, thumb: p.thumb, caption: `${caption} (${i + 1}/${photos.length})` }));
  return (
    <>
      <div className={`grid gap-0.5 bg-slate-200 overflow-hidden ${layout} ${className}`}>
        {shown.map((p, i) => {
          const big = shown.length < 3 || i === 0;
          return (
            <button
              key={p.url}
              type="button"
              onClick={() => setOpen(i)}
              aria-label={t('photo.strip.n', { i: i + 1, n: photos.length })}
              className={`relative z-10 min-h-0 bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-500 ${
                shown.length >= 3 && i === 0 ? 'col-span-2 row-span-2' : ''
              }`}
            >
              <img
                src={big ? p.medium || p.url : p.thumb || p.medium || p.url}
                alt=""
                loading={eager ? 'eager' : 'lazy'}
                decoding="async"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover"
              />
              {more > 0 && i === shown.length - 1 && (
                <span className="absolute inset-0 bg-slate-950/50 text-white text-lg font-bold flex items-center justify-center">+{more}</span>
              )}
            </button>
          );
        })}
      </div>
      {open !== null && <PhotoLightbox items={items} index={open} onClose={() => setOpen(null)} />}
    </>
  );
};

// ---------- what a record says ----------

const KIND_ICON: Partial<Record<LogKind, React.ComponentType<{ className?: string }>>> = {
  bloom: Flower2,
  count: ClipboardList,
  harvest: Wheat,
  task: ListChecks,
  rain: CloudRain,
  treeData: Ruler,
};

export interface RecordView {
  /** Tree ID, else the block, else nothing (rain is for the farm). */
  where: string;
  /** The kind in words, for everything but a worker's report (most of every list). */
  kind?: string;
  text: string;
  tags: Tag[];
  photos: ReportPhoto[];
  href: string;
  who: string;
  /** Red line on the card: the report found the tree in danger. */
  alert: boolean;
}

/** Words for one record (and the records the bot filed from it). */
export function useRecordView() {
  const { t, lang } = useT();
  const { workerLabel } = useFarm();
  const value = useEditValue();
  const harvestLine = (fruits: number, kg?: number) => [t('feed.picked', { n: fruits }), kg ? `${kg} kg` : ''].filter(Boolean).join(', ');

  return (e: LogEntry, filed: LogEntry[] = []): RecordView => {
    const base = {
      where: e.treeId || (e.block ? t('common.blockN', { n: e.block }) : ''),
      photos: e.photos || [],
      href: recordUrl(e),
      who: e.who ? workerLabel(e.who) : '',
      alert: false,
    };
    switch (e.kind) {
      case 'issue': {
        const r = e.rec;
        const v = reportValues(r);
        const tags = reportTags(v, lang, t('cond.improving').toLowerCase());
        // What the bot filed from this report, as a tag each.
        for (const f of filed) {
          if (f.kind === 'harvest') tags.push({ key: `f:${f.key}`, label: harvestLine(f.rec.fruits, f.rec.weightKg), tone: 'work' });
          else if (f.kind === 'count') tags.push({ key: `f:${f.key}`, label: `${t(`crop.stage.${f.rec.stage}`)}: ${f.rec.count}`, tone: 'work' });
          else if (f.kind === 'bloom') tags.push({ key: `f:${f.key}`, label: t('feed.bloomRecorded'), tone: 'work' });
        }
        if (v.harvest && !filed.some((f) => f.kind === 'harvest')) tags.push({ key: 'hv', label: harvestLine(v.harvest.fruits, v.harvest.weightKg), tone: 'work' });
        const words = hasWords(r.description) ? r.description!.trim() : '';
        const summary = r.triage?.source === 'ai' ? r.triage.summary || '' : '';
        return { ...base, text: words || summary, tags, alert: v.health === 'merah' };
      }
      case 'harvest': {
        const h = e.rec;
        const grades = GRADES.filter((g) => h.grades?.[g]).map((g) => `${t(`grade.${g}`)} ${h.grades![g]}`);
        const tags: Tag[] = grades.map((g) => ({ key: g, label: g, tone: 'plain' as TagTone }));
        for (const p of h.problems || []) tags.push({ key: `p:${p}`, label: t(`rec.hv.p.${p}`), tone: 'problem' });
        return { ...base, kind: t('log.kind.harvest'), text: harvestLine(h.fruits, h.weightKg), tags };
      }
      case 'count':
        return { ...base, kind: t('log.kind.count'), text: `${t(`crop.stage.${e.rec.stage}`)}: ${e.rec.count}`, tags: [] };
      case 'bloom':
        return { ...base, kind: t('log.kind.bloom'), text: t('feed.bloom', { part: t(`guide.part.${e.rec.part}`) }), tags: [] };
      case 'task':
        return {
          ...base,
          kind: t('log.kind.task'),
          text: SEASON_TASKS[e.rec.task] ? pick(SEASON_TASKS[e.rec.task].title, lang) : e.rec.task,
          tags: [],
        };
      case 'rain':
        return { ...base, kind: t('log.kind.rain'), text: t('feed.rain', { mm: e.rec.rainMm }), tags: [] };
      case 'treeData': {
        const parts = Object.entries(e.rec.changes || {}).map(([f, c]) => {
          if (f === 'active') return c.to === false ? t('log.s.archived') : t('log.s.restored');
          const label = FIELD_KEY[f] ? t(FIELD_KEY[f]) : f;
          if (TEXT_FIELDS.has(f)) return t('log.s.textChanged', { field: label });
          return `${label}: ${value(f, c.from)} → ${value(f, c.to)}`;
        });
        return { ...base, kind: t('log.kind.treeData'), text: parts.join('; '), tags: [] };
      }
    }
  };
}

/** "14:05" today, "Yesterday", else "9 Oct"; `timeOnly` in lists grouped by day. */
export function useWhen() {
  const { t, locale } = useT();
  return (e: Pick<LogEntry, 'at' | 'timed'>, timeOnly = false): string => {
    const d = new Date(e.at);
    const time = e.timed ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';
    if (timeOnly) return time;
    const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
    const now = new Date();
    if (day(d) === day(now)) return time || t('feed.today');
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (day(d) === day(y)) return t('feed.yesterday');
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  };
}

const TILE: Record<LogKind, string> = {
  issue: 'bg-slate-100 text-slate-400',
  harvest: 'bg-emerald-50 text-emerald-700',
  count: 'bg-amber-50 text-amber-800',
  bloom: 'bg-pink-50 text-pink-700',
  task: 'bg-teal-50 text-teal-700',
  rain: 'bg-sky-50 text-sky-700',
  treeData: 'bg-slate-100 text-slate-500',
};

/** In place of photos (a rain day, a count typed in the app): the record's number large, so every card lines up. */
const NoPhotoTile: React.FC<{ entry: LogEntry }> = ({ entry: e }) => {
  const { t } = useT();
  const Icon = KIND_ICON[e.kind] || CameraOff;
  const big =
    e.kind === 'harvest'
      ? { n: e.rec.fruits, unit: t('hv2.fruit') }
      : e.kind === 'rain'
        ? { n: e.rec.rainMm, unit: 'mm' }
        : e.kind === 'count'
          ? { n: e.rec.count, unit: t(`crop.stage.${e.rec.stage}`) }
          : null;
  return (
    <div className={`aspect-[4/3] flex flex-col items-center justify-center gap-1.5 ${TILE[e.kind]}`} aria-hidden>
      <Icon className={big ? 'w-6 h-6' : 'w-10 h-10'} />
      {big ? (
        <p className="text-center leading-tight">
          <span className="block text-4xl font-bold tabular">{big.n}</span>
          <span className="text-sm font-semibold">{big.unit}</span>
        </p>
      ) : (
        e.kind === 'issue' && <p className="text-xs font-medium">{t('feed.noPhoto')}</p>
      )}
    </div>
  );
};

// ---------- the card (lists) ----------

/**
 * One record as a card: photos on top, then tree and time, the words, the tags, who sent it. The whole card opens the
 * record; the tree ID opens the tree; a photo opens the viewer.
 */
export const RecordCard: React.FC<{ entry: LogEntry; filed?: LogEntry[]; timeOnly?: boolean; eager?: boolean; showTree?: boolean }> = ({
  entry: e,
  filed,
  timeOnly,
  eager,
  showTree = true,
}) => {
  const { t } = useT();
  const view = useRecordView()(e, filed);
  const when = useWhen()(e, timeOnly);
  const hasPhoto = view.photos.length > 0;
  return (
    <article
      className={`relative bg-white rounded-xl border overflow-hidden flex flex-col transition-colors hover:border-slate-400 focus-within:border-emerald-500 ${
        view.alert ? 'border-rose-300' : 'border-slate-200'
      }`}
    >
      <Link
        to={view.href}
        onClick={() => e.kind === 'issue' && rememberReport(e.rec)}
        aria-label={t('log.openRow', { kind: view.kind || t('log.kind.issue'), where: view.where })}
        className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      />
      {hasPhoto ? <PhotoGrid photos={view.photos} caption={view.where} eager={eager} className="aspect-[4/3]" /> : <NoPhotoTile entry={e} />}
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <header className="flex items-baseline gap-2">
          {showTree && view.where && (
            e.treeId ? (
              <Link to={treeUrl(e.treeId)} className="relative z-10 font-mono font-bold text-slate-900 hover:text-emerald-700 hover:underline underline-offset-2">
                {view.where}
              </Link>
            ) : (
              <span className="font-semibold text-slate-900">{view.where}</span>
            )
          )}
          {view.kind && <span className="text-sm font-semibold text-slate-700">{view.kind}</span>}
          <span className="ml-auto text-xs text-slate-500 tabular whitespace-nowrap">{when}</span>
        </header>
        {view.text && <p className="text-sm text-slate-800 leading-snug line-clamp-3 whitespace-pre-line">{view.text}</p>}
        <Tags tags={view.tags} />
        {view.who && <p className="mt-auto pt-0.5 text-xs text-slate-500">{view.who}</p>}
      </div>
    </article>
  );
};

/** A grid of record cards (2-3 across on wide screens); cards in a row are as tall as each other. */
export const RecordGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
);

// ---------- one event in a history line (a tree, a problem) ----------

/**
 * One step in a history: a dot on the line, when, what, the tags, and the photos as a row of large tiles.
 * `title` replaces the record's own words (a problem's history says "Treated: Kerok & oles batang").
 */
export const HistoryItem: React.FC<{
  entry?: LogEntry;
  filed?: LogEntry[];
  /** When there is no record (an event typed in the app): its date (YYYY-MM-DD). */
  date?: string;
  title?: React.ReactNode;
  note?: string;
  tone?: TagTone;
  extraTags?: Tag[];
  /** Hide the record's own tags (the title already says it). */
  plain?: boolean;
  last?: boolean;
}> = ({ entry, filed, date, title, note, tone, extraTags = [], plain, last }) => {
  const { t, locale } = useT();
  const toView = useRecordView();
  const toWhen = useWhen();
  const view = entry ? toView(entry, filed) : null;
  const day = entry ? toWhen(entry) : '';
  const time = entry ? toWhen(entry, true) : '';
  const when = entry
    ? !time || day === time
      ? day
      : `${day}, ${time}`
    : date
      ? new Date(`${date}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
      : '';
  const dotTone = tone || view?.tags.find((g) => DOT[g.tone])?.tone;
  const tags = [...(plain || !view ? [] : view.tags), ...extraTags];
  return (
    <li className="relative pl-6 pb-5">
      {!last && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-slate-200" aria-hidden />}
      <span className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-white ring-1 ring-slate-300 ${(dotTone && DOT[dotTone]) || 'bg-slate-400'}`} aria-hidden />
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700 tabular">{when}</span>
          {view?.who && <span>{view.who}</span>}
          {view && (
            <Link
              to={view.href}
              onClick={() => entry?.kind === 'issue' && rememberReport(entry.rec)}
              className="ml-auto font-semibold text-emerald-700 hover:underline"
            >
              {t('feed.open')}
            </Link>
          )}
        </p>
        {(title || view?.kind) && <p className="text-sm font-semibold text-slate-900">{title || view?.kind}</p>}
        {(note || view?.text) && <p className="text-sm text-slate-700 leading-snug whitespace-pre-line line-clamp-4">{note || view?.text}</p>}
        <Tags tags={tags} />
        {view && view.photos.length > 0 && <HistoryPhotos photos={view.photos} caption={view.where} />}
      </div>
    </li>
  );
};

/** A history event's photos: a row of large tiles that scrolls sideways when there are many. */
const HistoryPhotos: React.FC<{ photos: ReportPhoto[]; caption: string }> = ({ photos, caption }) => {
  const { t } = useT();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {photos.map((p, i) => (
          <button
            key={p.url}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={t('photo.strip.n', { i: i + 1, n: photos.length })}
            className="shrink-0 w-40 h-32 sm:w-48 sm:h-36 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 focus-visible:outline-2 focus-visible:outline-emerald-500"
          >
            <img src={p.medium || p.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      {open !== null && (
        <PhotoLightbox
          items={photos.map((p, i) => ({ url: p.url, medium: p.medium, thumb: p.thumb, caption: `${caption} (${i + 1}/${photos.length})` }))}
          index={open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
};

/** A report as a log entry (for lists that only have reports). */
export const reportEntry = (r: import('../types').TreeReport): LogEntry => ({
  kind: 'issue',
  key: `issue:${r.id}`,
  at: normalizeTimestamp(r.createdAt),
  timed: true,
  treeId: r.treeId,
  block: r.block,
  source: 'whatsapp',
  who: r.workerPhone,
  photos: r.photos,
  rec: r,
});

