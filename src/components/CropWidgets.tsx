import React, { useState } from 'react';
import { Trash2, Wheat } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { Sheet, fieldInput, fieldLabel } from './Sheet';
import { btnPrimary } from './PageHeader';
import { CROP_STAGES, GRADES, removeCropCount, saveCropCount } from '../lib/fieldData';
import { GradeTotals, TreeCrop } from '../lib/crop';
import { type CountKind, checkCount, countMax, pastCounts, planCount } from '../lib/recount';
import { readBy, saveBy } from '../lib/by';
import { formatShortDate, todayStr } from '../lib/treatments';
import type { DurianTree } from '../types';
import { StagePill } from './GuideWidgets';
import { HarvestSheet } from './FieldRecords';
import { useCrops } from './useCrops';
import { SourceBadge } from './SourceBadge';
import { DuePill, MissedLink, ViaWhatsApp } from './FieldFirst';
import { PhotoStrip } from './PhotoStrip';

/**
 * Harvest tracking per tree: flower clusters → fruit set → kept after thinning → fruit on the tree → graded harvest.
 * Shared by the Harvest page, the Dashboard and the tree page.
 */

const GRADE_BAR: Record<keyof GradeTotals, string> = {
  extra: 'bg-emerald-600',
  class1: 'bg-teal-400',
  class2: 'bg-amber-400',
  reject: 'bg-rose-500',
  ungraded: 'bg-slate-300',
};
const GRADE_KEYS = [...GRADES, 'ungraded'] as const;

/** Stacked bar of harvested fruit per grade, with an optional legend. */
export const GradeBar: React.FC<{ grades: GradeTotals; legend?: boolean; className?: string }> = ({ grades, legend, className = '' }) => {
  const { t } = useT();
  const total = GRADE_KEYS.reduce((n, g) => n + grades[g], 0);
  if (!total) return null;
  return (
    <div className={className}>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100" role="img" aria-label={GRADE_KEYS.filter((g) => grades[g]).map((g) => `${t(`grade.${g}`)} ${grades[g]}`).join(', ')}>
        {GRADE_KEYS.map((g) => (grades[g] ? <span key={g} className={GRADE_BAR[g]} style={{ width: `${(grades[g] / total) * 100}%` }} /> : null))}
      </div>
      {legend && (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700">
          {GRADE_KEYS.filter((g) => grades[g]).map((g) => (
            <li key={g} className="inline-flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-sm ${GRADE_BAR[g]}`} aria-hidden />
              {t(`grade.${g}.short`)} <span className="font-semibold tabular">{grades[g]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ---------- count sheet ----------

/**
 * Count one tree: its fruit or its flower clusters, one number for the whole tree (like a row of the Count sheet, and
 * filed the same way: lib/recount.ts planCount). Counting again on the same day replaces that day's count.
 */
export const CropCountSheet: React.FC<{ crop: TreeCrop; onClose: () => void; onSaved?: (msg: string) => void }> = ({ crop, onClose, onSaved }) => {
  const { t } = useT();
  const { cropCounts } = useFarm();
  const tree = crop.tree;
  const [kind, setKind] = useState<CountKind>(crop.next?.kind === 'clusters' ? 'clusters' : 'fruit');
  const [count, setCount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [by, setBy] = useState(readBy);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mine = cropCounts.filter((c) => c.treeId === tree.id);
  const last = [...pastCounts(mine, crop.waves.map((w) => w.date), kind, '9999-12-31')].pop();

  const save = async () => {
    const check = checkCount(count, kind);
    if (!check.ok || check.value === null) return setError(t('crop.e.count', { max: countMax(kind) }));
    if (!date || date > todayStr()) return setError(t('crop.e.date'));
    const plan = planCount({ tree, waves: crop.waves, counts: cropCounts, kind, date, value: check.value, by: by.trim(), note: note.trim() });
    if (!plan) return setError(t(crop.waves.length ? 'crop.e.date' : 'crop.e.noBloom'));
    setSaving(true);
    setError(null);
    try {
      await saveCropCount(plan.count, plan.treeField, plan.replaces);
      saveBy(by);
      onSaved?.(t('crop.saved', { id: tree.id, stage: t(`count.kind.${kind}`), n: check.value }));
      onClose();
    } catch (e: any) {
      console.error('Crop count failed:', e);
      setError(e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError'));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={t(kind === 'clusters' ? 'count.title.clusters' : 'count.title.fruit')}
      subtitle={`${t('rep.treeN', { id: tree.id })} · ${t('common.blockN', { n: tree.block })}`}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p role="alert" className="text-xs text-rose-700 font-medium">{error}</p>}
          <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} w-full min-h-12`}>
            {saving ? t('rec.saving') : t('crop.sheet.save')}
          </button>
        </div>
      }
    >
      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">{t('ff.sheetNote')}</p>
      {crop.waves.length === 0 && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">{t('crop.e.noBloom')}</p>}
      <div role="radiogroup" aria-label={t('count.what')} className="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
        {(['fruit', 'clusters'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`min-h-11 rounded-md text-sm font-semibold ${kind === k ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
          >
            {t(`count.kind.${k}`)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cc-count" className={fieldLabel}>{t('crop.sheet.count')}</label>
          <input
            id="cc-count"
            type="text"
            inputMode="numeric"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className={`${fieldInput} text-2xl font-bold tabular`}
            autoFocus
          />
          {last && <p className="mt-1 text-xs text-slate-500">{t('crop.sheet.last', { n: last[1], date: formatShortDate(last[0]) })}</p>}
        </div>
        <div>
          <label htmlFor="cc-date" className={fieldLabel}>{t('rec.date')}</label>
          <input id="cc-date" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className={fieldInput} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cc-by" className={fieldLabel}>{t('crop.sheet.by')}</label>
          <input id="cc-by" value={by} onChange={(e) => setBy(e.target.value)} className={fieldInput} />
        </div>
        <div>
          <label htmlFor="cc-note" className={fieldLabel}>{t('common.notes')}</label>
          <input id="cc-note" value={note} onChange={(e) => setNote(e.target.value)} className={fieldInput} />
        </div>
      </div>
    </Sheet>
  );
};

// ---------- tree page ----------

/** One tree's crop this season: each step with its latest count, what to count next, and graded harvest. */
export const TreeCropCard: React.FC<{ tree: DurianTree }> = ({ tree }) => {
  const { t } = useT();
  const { cropCounts, workerLabel } = useFarm();
  const { crops } = useCrops();
  const crop = crops.find((c) => c.tree.id === tree.id);
  const [counting, setCounting] = useState(false);
  const [harvesting, setHarvesting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  if (!crop) return null;
  const waveDates = new Set(crop.waves.map((w) => w.date));
  const history = cropCounts.filter((c) => c.treeId === tree.id && waveDates.has(c.season)).sort((a, b) => b.date.localeCompare(a.date));
  const next = crop.next;

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3" aria-labelledby="crop-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="crop-h" className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Wheat className="w-4 h-4 text-emerald-600" />
          {t('crop.tree.title')}
        </h2>
        <span className="flex flex-wrap gap-1">
          {crop.waves.map((w) => (
            <StagePill key={w.date} stage={w.stage} />
          ))}
        </span>
      </div>

      {crop.waves.length === 0 ? (
        <p className="text-sm text-slate-600">{t('crop.tree.noBloom', { block: tree.block })}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {next ? <DuePill crop={crop} /> : <span />}
            <ViaWhatsApp text={t('ff.viaTree')} />
          </div>
          <ol className="divide-y divide-slate-100">
            {CROP_STAGES.map((st) => {
              const c = crop.counts[st];
              return (
                <li key={st} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{t(`crop.stage.${st}`)}</span>
                    <span className="block text-xs text-slate-500">
                      {c ? `${formatShortDate(c.date)}${c.fromTree ? ` · ${t('crop.fromTree')}` : ''}` : t('crop.notCounted')}
                    </span>
                  </span>
                  <span className="text-xl font-bold tabular text-slate-900">{c ? c.count : '—'}</span>
                </li>
              );
            })}
            <li className="py-2 space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{t('crop.stage.harvested')}</span>
                  <span className="block text-xs text-slate-500">
                    {crop.harvested.lastDate ? t('crop.lastPick', { date: formatShortDate(crop.harvested.lastDate) }) : t('crop.notPicked')}
                    {crop.remaining !== undefined ? ` · ${t('crop.remaining', { n: crop.remaining })}` : ''}
                  </span>
                </span>
                <span className="text-xl font-bold tabular text-slate-900">{crop.harvested.fruits || '—'}</span>
              </div>
              <GradeBar grades={crop.harvested.grades} legend />
            </li>
          </ol>
          {crop.waves.length > 1 && <p className="text-xs text-slate-600">{t('crop.tree.waves', { n: crop.waves.length })}</p>}
          {msg && <p role="status" className="text-xs text-emerald-700">{msg}</p>}
          <div className="flex flex-wrap gap-x-3">
            <MissedLink onClick={() => setCounting(true)} label={t('ff.missedCount')} />
            <MissedLink onClick={() => setHarvesting(true)} label={t('ff.missedHarvest')} />
          </div>
          {history.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-xs font-semibold text-slate-600 underline min-h-8">
                {showHistory ? t('crop.history.hide') : t('crop.history.show', { n: history.length })}
              </button>
              {showHistory && (
                <ul className="mt-1 divide-y divide-slate-100">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className="min-w-0 flex-1">
                        {formatShortDate(h.date)} · {t(`crop.stage.${h.stage}`)} <span className="font-semibold tabular">{h.count}</span>
                        {h.by ? <span className="text-xs text-slate-500"> · {workerLabel(h.by)}</span> : null}{' '}
                        <SourceBadge source={h.source} />
                        {h.note ? <span className="block text-xs text-slate-500">{h.note}</span> : null}
                        <PhotoStrip photos={h.photos} caption={`${h.treeId} · ${t(`crop.stage.${h.stage}`)} · ${formatShortDate(h.date)}`} />
                      </span>
                      <button
                        type="button"
                        onClick={() => window.confirm(t('crop.history.confirm')) && removeCropCount(h.id, h.photos)}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                        aria-label={t('rec.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {counting && <CropCountSheet crop={crop} onClose={() => setCounting(false)} onSaved={setMsg} />}
      {harvesting && <HarvestSheet initialTree={tree.id} onClose={() => setHarvesting(false)} onSaved={setMsg} />}
    </section>
  );
};

// ---------- grading criteria ----------
