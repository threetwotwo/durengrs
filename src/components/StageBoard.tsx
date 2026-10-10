import React from 'react';
import { useT } from '../i18n';
import { FARM_STAGE_INFO, isFarmStage, stageMismatch, type FarmStage } from '../shared';
import { diffDays, todayStr } from '../lib/treatments';
import type { DurianTree } from '../types';
import type { TreeCrop } from '../lib/crop';
import { StagePill } from './GuideWidgets';
import { FarmStageChip } from './FieldStage';

/**
 * Stages seen in the field (from confirmed reports) next to the stage expected from the bloom date.
 * A stage not seen for 30 days no longer describes the tree.
 */

/** Days after which an observed stage is too old to describe the tree now. */
export const OBSERVED_FRESH_DAYS = 30;

export function observedNow(tree: DurianTree, today = todayStr()): { code: FarmStage; stale: boolean; date: string } | null {
  const o = tree.observedStage;
  if (!o || !isFarmStage(o.code)) return null;
  return { code: o.code, stale: diffDays(today, o.date) > OBSERVED_FRESH_DAYS, date: o.date };
}

/** What was seen fits none of the tree's flowering waves (one tree can carry several stages at once). */
export function cropMismatch(code: FarmStage, crop?: TreeCrop): boolean {
  const waves = crop?.waves ?? [];
  return waves.length > 0 && waves.every((w) => stageMismatch(code, w.stage));
}

/** A tree's stage: what was seen (if recent) and what the bloom date predicts, flagged when they disagree. */
export const TreeStageCell: React.FC<{ tree: DurianTree; crop?: TreeCrop; compact?: boolean }> = ({ tree, crop, compact }) => {
  const { t } = useT();
  const seen = observedNow(tree);
  const expected = crop?.waves[0]?.stage;
  const mismatch = !!seen && !seen.stale && cropMismatch(seen.code, crop);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {seen && (
        <FarmStageChip
          code={seen.code}
          stale={seen.stale}
          mismatch={mismatch}
          title={`${t('stage.seenOn', { date: seen.date })}${mismatch ? ` · ${t('inbox.mismatch')}` : ''}`}
        />
      )}
      {/* The expected stage only adds something when nothing recent was seen, or it says something else. */}
      {expected && (!seen || (!compact && (seen.stale || FARM_STAGE_INFO[seen.code].engine !== expected))) && <StagePill farm stage={expected} active={!seen} />}
    </span>
  );
};

export { FarmStageChip };
