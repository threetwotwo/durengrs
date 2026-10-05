import React, { useMemo } from 'react';
import { Eye } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { FARM_STAGES, FARM_STAGE_INFO, isFarmStage, stageMismatch, type FarmStage } from '../shared';
import { diffDays, todayStr } from '../lib/treatments';
import type { DurianTree } from '../types';
import type { TreeCrop } from '../lib/crop';
import { Link } from './Link';
import { StagePill } from './GuideWidgets';
import { FarmStageChip } from './FieldStage';
import { useCrops } from './useCrops';
import { treesUrl } from '../lib/router';

/**
 * Stages seen in the field: per block, how many trees are at each stage of the farm scale (from confirmed reports),
 * next to the stage expected from the bloom date. A tree not seen for 30 days counts as "belum dilihat".
 */

/** Days after which an observed stage is too old to describe the tree now. */
export const OBSERVED_FRESH_DAYS = 30;

/** One hue, light to dark, in season order (ordered categories); identity is always also written in the legend. */
const STAGE_COLOR = (i: number) => `hsl(158 55% ${84 - i * 6}%)`;
const stageColor = (s: FarmStage) => STAGE_COLOR(FARM_STAGES.indexOf(s));

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

export const StageBoard: React.FC = () => {
  const { t, lang } = useT();
  const { trees } = useFarm();
  const { seasons, crops } = useCrops();
  const today = todayStr();
  const cropById = useMemo(() => new Map(crops.map((c) => [c.tree.id, c])), [crops]);
  const rows = useMemo(() => {
    const byBlock = new Map<string, DurianTree[]>();
    for (const tr of trees) {
      const list = byBlock.get(tr.block) || [];
      list.push(tr);
      byBlock.set(tr.block, list);
    }
    return Array.from(byBlock.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([block, list]) => {
        const counts = new Map<FarmStage, number>();
        let unseen = 0;
        let off = 0;
        for (const tr of list) {
          const s = observedNow(tr, today);
          if (!s || s.stale) unseen++;
          else {
            counts.set(s.code, (counts.get(s.code) || 0) + 1);
            if (cropMismatch(s.code, cropById.get(tr.id))) off++;
          }
        }
        const season = seasons.find((x) => x.block === block);
        return { block, total: list.length, counts, unseen, off, season };
      });
  }, [trees, seasons, cropById, today]);
  const anySeen = rows.some((r) => r.counts.size > 0);

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden" aria-labelledby="sb-h">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 id="sb-h" className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Eye className="w-5 h-5 text-sky-600" />
          {t('stage.board.title')}
        </h2>
        <p className="text-xs text-slate-600">{t('stage.board.sub', { n: OBSERVED_FRESH_DAYS })}</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map(({ block, total, counts, unseen, off, season }) => {
          const stages = FARM_STAGES.filter((s) => counts.has(s));
          return (
            <li key={block} className="px-4 py-3 grid gap-2 sm:grid-cols-[110px_1fr] sm:items-center">
              <div>
                <Link to={treesUrl({ block })} className="font-semibold text-slate-900 hover:underline">
                  {t('common.blockN', { n: block })}
                </Link>
                <span className="block text-xs text-slate-500 tabular">{t('stage.board.trees', { n: total })}</span>
              </div>
              <div className="space-y-1.5 min-w-0">
                {season?.young ? (
                  <p className="text-sm text-slate-500">{t('dash.col.young')}</p>
                ) : (
                  <>
                    <div
                      className="flex h-3.5 gap-[2px] rounded-[4px] overflow-hidden bg-white"
                      role="img"
                      aria-label={[...stages.map((s) => `${FARM_STAGE_INFO[s].label[lang]} ${counts.get(s)}`), `${t('stage.unseen')} ${unseen}`].join(', ')}
                    >
                      {stages.map((s) => (
                        <span key={s} title={`${FARM_STAGE_INFO[s].label[lang]}: ${counts.get(s)}`} style={{ width: `${(counts.get(s)! / total) * 100}%`, background: stageColor(s) }} />
                      ))}
                      {unseen > 0 && <span title={`${t('stage.unseen')}: ${unseen}`} className="bg-slate-200" style={{ width: `${(unseen / total) * 100}%` }} />}
                    </div>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-700">
                      {stages.map((s) => (
                        <span key={s} className="inline-flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: stageColor(s) }} aria-hidden />
                          {FARM_STAGE_INFO[s].label[lang]} <strong className="tabular">{counts.get(s)}</strong>
                        </span>
                      ))}
                      {unseen > 0 && (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <span className="w-2.5 h-2.5 rounded-sm bg-slate-200" aria-hidden />
                          {t('stage.unseen')} <strong className="tabular">{unseen}</strong>
                        </span>
                      )}
                      {off > 0 && (
                        <Link to={treesUrl({ block })} className="font-semibold text-violet-800 hover:underline">
                          {t('stage.board.off', { n: off })}
                        </Link>
                      )}
                      {season && season.stages.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          · {t('stage.expected')}
                          {season.stages.map((st) => (
                            <StagePill key={st} stage={st} active={false} />
                          ))}
                        </span>
                      )}
                    </p>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!anySeen && <p className="px-4 py-3 border-t border-slate-100 text-xs text-slate-600">{t('stage.board.empty')}</p>}
    </section>
  );
};

export { FarmStageChip };
