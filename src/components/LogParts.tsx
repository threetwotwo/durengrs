import React from 'react';
import { AlertTriangle, ClipboardList, CloudRain, Flower2, ListChecks, Ruler, Trash2, Wheat } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { reportUrl } from '../lib/router';
import { rememberReport } from '../lib/reportCache';
import { type LogEntry, type LogKind, recordKey } from '../lib/fieldLog';
import { removeCropCount, removeTreeBloom, saveRain, unmarkSeasonTask, GRADES } from '../lib/fieldData';
import { SEASON_TASKS } from '../lib/fieldInsights';
import { pick } from '../lib/guide';
import { formatShortDate } from '../lib/treatments';
import { plantedDateStr } from '../lib/trees';
import { FARM_STAGE_INFO, isFarmStage } from '../shared';
import { Link } from './Link';
import { TreeLink } from './CropWidgets';
import { SourceBadge } from './SourceBadge';
import { PhotoStrip } from './PhotoStrip';
import { ConditionBadge } from './ConditionBadge';
import { ReportReading } from './FieldStage';

/** Pieces shared by the Laporan list and the record page: icon, colour, one-line summary, delete, link. */

export const KIND_ICON: Record<LogKind, React.ComponentType<{ className?: string }>> = {
  issue: AlertTriangle,
  bloom: Flower2,
  count: ClipboardList,
  harvest: Wheat,
  task: ListChecks,
  rain: CloudRain,
  treeData: Ruler,
};
export const KIND_TONE: Record<LogKind, string> = {
  issue: 'bg-rose-50 text-rose-700',
  bloom: 'bg-pink-50 text-pink-700',
  count: 'bg-amber-50 text-amber-800',
  harvest: 'bg-emerald-50 text-emerald-700',
  task: 'bg-teal-50 text-teal-700',
  rain: 'bg-sky-50 text-sky-700',
  treeData: 'bg-slate-100 text-slate-700',
};
export const FIELD_KEY: Record<string, string> = {
  canopySize: 'field.canopy',
  trunkSize: 'field.trunk',
  floweringBranches: 'field.branches',
  floweringClusters: 'field.clusters',
  estimatedFruitCount: 'field.fruits',
  notes: 'common.notes',
  conditionNotes: 'tree.conditionNotes',
  condition: 'common.condition',
  observedStage: 'stage.seen',
  variant: 'common.variant',
  block: 'common.block',
  supplier: 'trees.col.supplier',
  datePlanted: 'trees.col.planted',
};
export const TEXT_FIELDS = new Set(['notes', 'conditionNotes']);

/** Local calendar day of a time, as YYYY-MM-DD. */
export const localDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The page a record opens. */
export const recordUrl = (e: LogEntry) => reportUrl(recordKey(e));

/** Records that can be deleted from the list or their page (worker reports have their own delete sheet). */
export const canDelete = (k: LogKind) => k !== 'issue' && k !== 'treeData';

export async function deleteRecord(e: LogEntry) {
  if (e.kind === 'count') await removeCropCount(e.rec.id, e.rec.photos);
  else if (e.kind === 'bloom') await removeTreeBloom(e.rec.id, e.rec.photos);
  else if (e.kind === 'harvest') await import('../lib/reportAdmin').then((m) => m.deleteHarvest(e.rec));
  else if (e.kind === 'task') await unmarkSeasonTask(e.rec.block, e.rec.season, e.rec.task);
  else if (e.kind === 'rain') await saveRain(e.rec.date, null);
}

/** One value of a tree edit, in words. */
export function useEditValue() {
  const { t, lang } = useT();
  return (field: string, v: unknown): string =>
    v === null || v === undefined || v === ''
      ? '—'
      : field === 'condition'
        ? t(`cond.${v}`)
        : field === 'observedStage'
          ? typeof v === 'string' && isFarmStage(v)
            ? FARM_STAGE_INFO[v].label[lang]
            : String(v)
          : field === 'datePlanted'
            ? formatShortDate(plantedDateStr(v)) || '—'
            : typeof v === 'object'
              ? '…'
              : String(v);
}

/** One line saying what a record holds. */
export function useLogSummary() {
  const { t, lang } = useT();
  const value = useEditValue();
  return (e: LogEntry): React.ReactNode => {
    switch (e.kind) {
      case 'issue': {
        const r = e.rec;
        const changed = r.conditionChanged && r.conditionBefore && r.conditionAfter && r.conditionBefore !== r.conditionAfter;
        return (
          <>
            {changed && <span className="block font-semibold">{t(`cond.${r.conditionBefore}`)} → {t(`cond.${r.conditionAfter}`)}</span>}
            <span className="line-clamp-2">{r.description || t('log.s.noText')}</span>
          </>
        );
      }
      case 'bloom':
        return t('log.s.bloom', { date: formatShortDate(e.rec.date), part: t(`guide.part.${e.rec.part}`) });
      case 'count':
        return (
          <>
            <span className="font-semibold">{t(`crop.stage.${e.rec.stage}`)}: {e.rec.count}</span>
            <span className="text-slate-500"> · {t('log.s.wave', { date: formatShortDate(e.rec.season) })}</span>
            {e.timed && e.rec.date !== localDay(e.at) && <span className="text-slate-500"> · {t('log.s.countedOn', { date: formatShortDate(e.rec.date) })}</span>}
          </>
        );
      case 'harvest': {
        const h = e.rec;
        const grades = GRADES.filter((g) => h.grades?.[g]).map((g) => `${t(`grade.${g}.short`)} ${h.grades![g]}`).join(', ');
        return (
          <>
            <span className="font-semibold">{t('log.s.fruit', { n: h.fruits })}</span>
            {h.weightKg ? ` · ${h.weightKg} kg` : ''}
            {grades ? ` · ${grades}` : ''}
            {h.problems?.length ? ` · ${h.problems.map((p) => t(`rec.hv.p.${p}`)).join(', ')}${h.problemFruits ? ` (${h.problemFruits})` : ''}` : ''}
            {e.timed && h.date !== localDay(e.at) && <span className="text-slate-500"> · {t('log.s.pickedOn', { date: formatShortDate(h.date) })}</span>}
          </>
        );
      }
      case 'task':
        return (
          <>
            <span className="font-semibold">{SEASON_TASKS[e.rec.task] ? pick(SEASON_TASKS[e.rec.task].title, lang) : e.rec.task}</span>
            <span className="text-slate-500"> · {t('log.s.doneOn', { date: formatShortDate(e.rec.date) })}</span>
          </>
        );
      case 'rain':
        return (
          <>
            <span className="font-semibold tabular">{e.rec.rainMm} mm</span>
            <span className="text-slate-500"> · {formatShortDate(e.rec.date)}</span>
          </>
        );
      case 'treeData': {
        const parts = Object.entries(e.rec.changes || {}).map(([f, c]) => {
          if (f === 'active') return c.to === false ? t('log.s.archived') : t('log.s.restored');
          const label = FIELD_KEY[f] ? t(FIELD_KEY[f]) : f;
          if (TEXT_FIELDS.has(f)) return t('log.s.textChanged', { field: label });
          return `${label}: ${value(f, c.from)} → ${value(f, c.to)}`;
        });
        return parts.join(' · ');
      }
    }
  };
}

/**
 * One record in a list. The whole row opens its page; the tree name, photos and delete sit above that link.
 * `dated` shows the date as well as the time (lists not grouped by day).
 */
export const LogRow: React.FC<{ entry: LogEntry; dated?: boolean; busy?: boolean; onDelete?: () => void }> = ({ entry: e, dated, busy, onDelete }) => {
  const { t, locale } = useT();
  const { workerLabel } = useFarm();
  const summary = useLogSummary();
  const Icon = KIND_ICON[e.kind];
  const where = e.treeId || (e.block ? t('common.blockN', { n: e.block }) : '');
  const time = e.timed ? new Date(e.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <li className="relative flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
      <Link
        to={recordUrl(e)}
        onClick={() => e.kind === 'issue' && rememberReport(e.rec)}
        aria-label={t('log.openRow', { kind: t(`log.kind.${e.kind}`), where })}
        className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600"
      />
      <span className={`mt-0.5 w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center ${KIND_TONE[e.kind]}`} aria-hidden>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <span className="font-semibold text-slate-900">{t(`log.kind.${e.kind}`)}</span>
          {e.treeId ? (
            <span className="relative z-10">
              <TreeLink id={e.treeId} />
            </span>
          ) : e.block ? (
            <span className="text-slate-700">{t('common.blockN', { n: e.block })}</span>
          ) : null}
          {e.treeId && e.block && <span className="text-xs text-slate-500">{t('common.blockN', { n: e.block })}</span>}
          {e.kind === 'issue' && e.rec.conditionAfter && <ConditionBadge condition={e.rec.conditionAfter} size="sm" />}
        </p>
        <div className="text-sm text-slate-800 min-w-0">{summary(e)}</div>
        {e.kind === 'issue' && <ReportReading report={e.rec} />}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {/* Rain's summary already names its day. */}
          {((dated && e.kind !== 'rain') || time) && (
            <span className="tabular">
              {dated && e.kind !== 'rain' ? formatShortDate(localDay(e.at)) : ''}
              {dated && e.kind !== 'rain' && time ? ' · ' : ''}
              {time}
            </span>
          )}
          {e.who && <span>{workerLabel(e.who)}</span>}
          {e.source === 'whatsapp' ? <SourceBadge source="whatsapp" /> : <span>{t('log.source.webapp')}</span>}
        </p>
        {e.photos && e.photos.length > 0 && (
          <span className="relative z-10 inline-block">
            <PhotoStrip photos={e.photos} caption={`${t(`log.kind.${e.kind}`)} · ${where}`} />
          </span>
        )}
      </div>
      {onDelete && (
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="relative z-10 shrink-0 p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          aria-label={t('rec.delete')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </li>
  );
};
