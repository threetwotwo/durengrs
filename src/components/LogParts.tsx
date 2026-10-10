import { useT } from '../i18n';
import { reportUrl } from '../lib/router';
import { type LogEntry, type LogKind, recordKey } from '../lib/fieldLog';
import { removeCropCount, removeTreeBloom, saveRain, unmarkSeasonTask } from '../lib/fieldData';
import { formatShortDate } from '../lib/treatments';
import { plantedDateStr } from '../lib/trees';
import { FARM_STAGE_INFO, isFarmStage } from '../shared';

/** Pieces shared by the record cards and the record page: field names, values in words, delete, link. */

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
  improving: 'cond.improving',
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
        : field === 'improving'
          ? v
            ? t('common.yes')
            : t('common.no')
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
