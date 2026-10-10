import React, { useMemo, useState } from 'react';
import { Check, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { useSeasons } from './useSeasons';
import { Sheet, fieldInput, fieldLabel } from './Sheet';
import { MissedLink } from './FieldFirst';
import {
  GRADES,
  Grade,
  HARVEST_PROBLEMS,
  HarvestProblem,
  LAB_KEYS,
  LabKey,
  SeasonTaskId,
  addHarvest,
  addLabResult,
  markSeasonTask,
  markWeeklyReview,
  removeLabResult,
  unmarkSeasonTask,
} from '../lib/fieldData';
import {
  LAB_RANGES,
  SEASON_TASKS,
  blockTasks,
  type BlockTask,
  labLevel,
  latestLabByBlock,
} from '../lib/fieldInsights';
import { BlockSeason, pick, treeWaves, waveWho } from '../lib/guide';
import { diffDays, formatShortDate, todayStr } from '../lib/treatments';

/**
 * Small, low-effort entry points for the farm records the Guide needs (see lib/fieldData.ts):
 * season-task Done chips, the rain card, the harvest log, lab results and the weekly review.
 */

const chip = 'min-h-9 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 transition-colors';
const primaryBtn =
  'min-h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold inline-flex items-center justify-center gap-2';

const errorText = (e: any, t: (k: string) => string) =>
  e?.code === 'permission-denied' ? t('err.rulesRecords') : t('rec.saveError');

// ---------- season tasks (A11) ----------

/** Per-block Done chips for one season task. Late = the window passed without a Done. */
export const SeasonTaskChips: React.FC<{ task: SeasonTaskId; seasons: BlockSeason[] }> = ({ task, seasons }) => {
  const { t } = useT();
  const { seasonTasksDone } = useFarm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // One chip per block, or per flowering wave when trees or branches flowered apart.
  const rows = seasons.flatMap((s) =>
    blockTasks(s, seasonTasksDone)
      .filter((bt) => bt.task === task && bt.status !== 'upcoming' && bt.status !== 'missed')
      .map((bt) => {
        const who = waveWho(bt.wave, s, t);
        return { s, bt, key: `${s.block}|${bt.wave.date}`, label: who ? `${s.block} · ${who}` : s.block };
      })
  );
  if (rows.length === 0) return null;

  const toggle = async (s: BlockSeason, bt: BlockTask, key: string) => {
    setBusy(key);
    setError(null);
    try {
      if (bt.status === 'done') await unmarkSeasonTask(s.block, bt.wave.date, task);
      else await markSeasonTask(s.block, bt.wave.date, task, todayStr());
    } catch (e) {
      console.error('Season task save failed:', e);
      setError(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="flex flex-wrap gap-1.5 mt-1.5">
      {rows.map(({ s, bt, key, label }) => {
        const done = bt.status === 'done';
        const late = bt.status === 'late';
        const tone = done
          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
          : late
          ? 'bg-amber-50 border-amber-300 text-amber-900'
          : 'bg-white border-slate-300 text-slate-800';
        const text = (
          <>
            {done && <Check className="w-3.5 h-3.5" />}
            {done
              ? t('rec.task.done', { block: label, date: formatShortDate(bt.doneDate!) })
              : late
              ? t('rec.task.late', { block: label })
              : t('rec.task.todo', { block: label })}
          </>
        );
        // Workers report finished tasks on WhatsApp; the chips only become buttons while marking by hand.
        return editing ? (
          <button
            key={key}
            type="button"
            disabled={busy === key}
            onClick={() => toggle(s, bt, key)}
            aria-pressed={done}
            title={done ? t('rec.task.undo') : t('rec.task.mark')}
            className={`${chip} ${tone} ring-1 ring-offset-1 ring-slate-300 hover:border-emerald-500`}
          >
            {text}
          </button>
        ) : (
          <span key={key} className={`${chip} ${tone}`}>
            {text}
          </span>
        );
      })}
      <MissedLink onClick={() => setEditing((v) => !v)} plain={editing} label={editing ? t('ff.doneEditing') : t('ff.missedTask')} />
      {error && <span role="alert" className="basis-full text-xs text-rose-700">{error}</span>}
    </span>
  );
};

// ---------- rain (A15) ----------

// ---------- harvest log (A6) ----------

/**
 * Log fruit picked: from one tree (per-tree tracking) or a whole block, counted per grade. Grades follow the Codex
 * durian standard (Extra, Class I, Class II) plus reject; reasons for rejects are the problem buttons.
 */
export const HarvestSheet: React.FC<{ onClose: () => void; initialBlock?: string; initialTree?: string; onSaved?: (msg: string) => void }> = ({
  onClose,
  initialBlock,
  initialTree,
  onSaved,
}) => {
  const { t, locale } = useT();
  const { variants, trees, blocks, harvestCycles: cycles, treeBlooms } = useFarm();
  const today = todayStr();
  const [date, setDate] = useState(today);
  const startTree = initialTree ? trees.find((x) => x.id === initialTree) : undefined;
  const [block, setBlock] = useState(startTree?.block || initialBlock || blocks[0] || '');
  const [treeId, setTreeId] = useState(startTree?.id || '');
  const blockTrees = useMemo(
    () => trees.filter((x) => x.block === block).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [trees, block]
  );
  const tree = blockTrees.find((x) => x.id === treeId);
  const blockVariants = useMemo(
    () => Array.from(new Set(blockTrees.filter((x) => x.variant).map((x) => x.variant))).sort(),
    [blockTrees]
  );
  const [variant, setVariant] = useState('');
  const [grades, setGrades] = useState<Record<Grade, string>>({ extra: '', class1: '', class2: '', reject: '' });
  const [weight, setWeight] = useState('');
  const [problems, setProblems] = useState<HarvestProblem[]>([]);
  const [problemFruits, setProblemFruits] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const chosenVariant = tree?.variant || (blockVariants.includes(variant) ? variant : blockVariants[0] || '');
  // Which flowers this fruit came from. Trees or branches can flower apart, so a block (or tree) can have several
  // dates: default to the one whose expected harvest is nearest the harvest day.
  const seasons = useSeasons();
  const season = seasons.find((x) => x.block === block);
  const [waveChoice, setWaveChoice] = useState('');
  const blockDate = cycles.find((c) => c.block === block)?.floweredOn;
  const waveDates = (
    tree && season ? treeWaves(tree, blockDate, treeBlooms, season.ripeMax + 90).map((w) => w.date) : (season?.waves || []).map((w) => w.date)
  ).filter((d) => d <= date);
  const ripening = Number(variants.find((v) => v.code === chosenVariant)?.ripeningDays) || season?.ripeMin || 120;
  const nearest = [...waveDates].sort((a, b) => Math.abs(diffDays(date, a) - ripening) - Math.abs(diffDays(date, b) - ripening))[0];
  const floweredOn = waveDates.includes(waveChoice) ? waveChoice : nearest ?? blockDate;
  const nums = GRADES.map((g) => (grades[g].trim() ? Number(grades[g]) : 0));
  const total = nums.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

  const save = async () => {
    const w = weight.trim() ? Number(weight.replace(',', '.')) : undefined;
    if (!block || !chosenVariant) return setError(t('rec.hv.e.block'));
    if (!tree) return setError(t('crop.e.tree'));
    if (!date || date > today) return setError(t('rec.e.date'));
    // Same limits as the WhatsApp Flow for one tree's harvest.
    const maxFruits = 500;
    const maxKg = 2000;
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > maxFruits)) return setError(t('rec.hv.e.grade', { max: maxFruits.toLocaleString(locale) }));
    if (total < 1 || total > maxFruits) return setError(t('rec.hv.e.fruits', { max: maxFruits.toLocaleString(locale) }));
    if (w !== undefined && (!Number.isFinite(w) || w < 0.5 || w > maxKg)) return setError(t('rec.hv.e.weight', { max: maxKg.toLocaleString(locale) }));
    // Same rule as the Flow: a quality problem needs the number of fruit that had one, and that number fits the harvest.
    const pf = problemFruits.trim() ? Number(problemFruits) : 0;
    if (problems.length) {
      if (!problemFruits.trim()) return setError(t('rec.hv.e.problemFruitsNeeded'));
      if (!Number.isInteger(pf) || pf < 1 || pf > total) return setError(t('rec.hv.e.problemFruits'));
    }
    const days = floweredOn && date >= floweredOn ? diffDays(date, floweredOn) : undefined;
    const graded = Object.fromEntries(GRADES.map((g, i) => [g, nums[i]]).filter(([, n]) => (n as number) > 0)) as Partial<Record<Grade, number>>;
    setSaving(true);
    setError(null);
    try {
      await addHarvest({
        block,
        treeId: tree?.id,
        variant: chosenVariant,
        date,
        fruits: total,
        weightKg: w,
        grades: graded,
        problems: problems.filter((p) => p),
        problemFruits: problems.length ? pf : undefined,
        floweredOn: days !== undefined ? floweredOn : undefined,
        daysFromBloom: days,
        notes: notes.trim() || undefined,
      });
      onSaved?.(t('rec.hv.saved', { n: total, where: tree ? t('rep.treeN', { id: tree.id }) : t('common.blockN', { n: block }) }));
      onClose();
    } catch (e) {
      console.error('Harvest save failed:', e);
      setError(errorText(e, t));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={t('rec.hv.add')}
      subtitle={t('rec.hv.sheetHelp')}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p role="alert" className="text-xs text-rose-700 font-medium">{error}</p>}
          <button type="button" onClick={save} disabled={saving} className={`${primaryBtn} w-full min-h-12`}>
            {saving ? t('rec.saving') : total > 0 ? t('rec.hv.saveN', { n: total }) : t('rec.hv.save')}
          </button>
        </div>
      }
    >
      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">{t('ff.sheetNote')}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="hv-date" className={fieldLabel}>{t('rec.date')}</label>
          <input id="hv-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={fieldInput} />
        </div>
        <div>
          <label htmlFor="hv-block" className={fieldLabel}>{t('common.block')}</label>
          <select
            id="hv-block"
            value={block}
            onChange={(e) => {
              setBlock(e.target.value);
              setTreeId('');
            }}
            className={fieldInput}
          >
            {blocks.map((b) => (
              <option key={b} value={b}>{t('common.blockN', { n: b })}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="hv-tree" className={fieldLabel}>{t('rec.hv.tree')}</label>
          <select id="hv-tree" value={treeId} onChange={(e) => setTreeId(e.target.value)} className={fieldInput}>
            <option value="" disabled>{t('crop.e.tree')}</option>
            {blockTrees.map((x) => (
              <option key={x.id} value={x.id}>{x.id}{x.variant ? ` · ${x.variant}` : ''}</option>
            ))}
          </select>
        </div>
        {!tree && blockVariants.length > 1 ? (
          <div>
            <label htmlFor="hv-variant" className={fieldLabel}>{t('common.variant')}</label>
            <select id="hv-variant" value={chosenVariant} onChange={(e) => setVariant(e.target.value)} className={fieldInput}>
              {blockVariants.map((v) => (
                <option key={v} value={v}>{v} · {variants.find((x) => x.code === v)?.name || v}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <span className={fieldLabel}>{t('common.variant')}</span>
            <p className="min-h-11 flex items-center text-sm text-slate-800">{variants.find((x) => x.code === chosenVariant)?.name || chosenVariant || '—'}</p>
          </div>
        )}
      </div>
      {season && waveDates.length > 1 && (
        <div>
          <label htmlFor="hv-wave" className={fieldLabel}>{t('rec.hv.wave')}</label>
          <select id="hv-wave" value={floweredOn} onChange={(e) => setWaveChoice(e.target.value)} className={fieldInput}>
            {season.waves
              .filter((w) => waveDates.includes(w.date))
              .map((w) => (
                <option key={w.date} value={w.date}>
                  {formatShortDate(w.date)}
                  {waveWho(w, season, t) ? ` · ${waveWho(w, season, t)}` : ''}
                </option>
              ))}
          </select>
        </div>
      )}
      <p className="text-xs text-slate-600">
        {floweredOn && date >= floweredOn
          ? t('rec.hv.bloomInfo', { date: formatShortDate(floweredOn), n: diffDays(date, floweredOn) })
          : t('rec.hv.noBloom')}
      </p>
      <div>
        <span className={fieldLabel}>{t('rec.hv.byGrade')}</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {GRADES.map((g) => (
            <label key={g} className={`block rounded-lg border p-2 ${GRADE_TONE[g]}`}>
              <span className="block text-xs font-bold">{t(`grade.${g}`)}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={500}
                value={grades[g]}
                onChange={(e) => setGrades((prev) => ({ ...prev, [g]: e.target.value }))}
                placeholder="0"
                aria-label={t(`grade.${g}`)}
                className="mt-1 w-full min-h-11 px-2 rounded-md border border-slate-300 bg-white text-lg font-bold tabular text-slate-900"
              />
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-600">{t('rec.hv.total', { n: total })}</p>
        <details className="mt-1.5 text-xs text-slate-700">
          <summary className="font-semibold text-emerald-700 cursor-pointer min-h-8 inline-flex items-center">{t('rec.hv.gradingHelp')}</summary>
          <ul className="mt-1 space-y-1">
            {GRADES.map((g) => (
              <li key={g}>
                <span className="font-semibold">{t(`grade.${g}`)}:</span> {t(`grade.${g}.criteria`)}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <div>
        <label htmlFor="hv-weight" className={fieldLabel}>{t('rec.hv.weight')}</label>
        <input id="hv-weight" type="text" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className={fieldInput} />
      </div>
      {(
        <div>
          <span className={fieldLabel}>{t('rec.hv.problems')}</span>
          <div className="flex flex-wrap gap-2">
            {HARVEST_PROBLEMS.map((p) => {
              const on = problems.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setProblems((prev) => (on ? prev.filter((x) => x !== p) : [...prev, p]))}
                  className={`min-h-11 px-3 rounded-full border text-sm font-semibold ${on ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-300 text-slate-700'}`}
                >
                  {t(`rec.hv.p.${p}`)}
                </button>
              );
            })}
          </div>
          {problems.length > 0 && (
            <div className="mt-2 max-w-48">
              <label htmlFor="hv-pf" className={fieldLabel}>{t('rec.hv.problemFruits')}</label>
              <input id="hv-pf" type="number" inputMode="numeric" min={1} max={total || undefined} value={problemFruits} onChange={(e) => setProblemFruits(e.target.value)} className={fieldInput} />
            </div>
          )}
        </div>
      )}
      <div>
        <label htmlFor="hv-notes" className={fieldLabel}>{t('common.notes')}</label>
        <textarea id="hv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldInput} />
      </div>
    </Sheet>
  );
};

/** Grade colours, shared with the harvest page's grade bars. */
export const GRADE_TONE: Record<Grade, string> = {
  extra: 'bg-emerald-50 border-emerald-300 text-emerald-900',
  class1: 'bg-teal-50 border-teal-300 text-teal-900',
  class2: 'bg-amber-50 border-amber-300 text-amber-900',
  reject: 'bg-rose-50 border-rose-300 text-rose-900',
};

// ---------- lab results (A16) ----------

const levelCls: Record<string, string> = {
  low: 'bg-amber-50 text-amber-900 border-amber-200',
  high: 'bg-amber-50 text-amber-900 border-amber-200',
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  none: 'bg-slate-50 text-slate-600 border-slate-200',
};

export const LabResults: React.FC = () => {
  const { t } = useT();
  const { labResults, blocks } = useFarm();
  const [open, setOpen] = useState(false);
  const latest = useMemo(() => latestLabByBlock(labResults), [labResults]);

  return (
    <div className="p-4 border-t border-slate-100 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5" />
          {t('rec.lab.title')}
        </h3>
        <button type="button" onClick={() => setOpen(true)} className={`${chip} bg-white border-slate-300 text-slate-800 hover:border-emerald-500`}>
          <Plus className="w-3.5 h-3.5" />
          {t('rec.lab.add')}
        </button>
      </div>
      {latest.size === 0 ? (
        <p className="text-sm text-slate-600">{t('rec.lab.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {Array.from(latest.values())
            .sort((a, b) => a.block.localeCompare(b.block, undefined, { numeric: true }))
            .map((r) => (
              <li key={r.id}>
                <p className="text-sm font-semibold text-slate-900">
                  {t('common.blockN', { n: r.block })} <span className="text-xs font-normal text-slate-500">· {formatShortDate(r.date)}{r.lab ? ` · ${r.lab}` : ''}</span>
                  <button
                    type="button"
                    onClick={() => window.confirm(t('rec.lab.confirmDelete')) && removeLabResult(r.id)}
                    className="ml-1 p-1 rounded text-slate-400 hover:text-slate-700 align-middle"
                    aria-label={t('rec.delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {LAB_KEYS.filter((k) => typeof r.values[k] === 'number').map((k) => {
                    const lv = labLevel(k, r.values[k]);
                    return (
                      <span key={k} className={`px-2 py-0.5 rounded border text-xs font-semibold tabular ${levelCls[lv]}`}>
                        {t(`guide.lab.${k}`)} {r.values[k]}
                        {LAB_RANGES[k].unit ? ` ${LAB_RANGES[k].unit}` : ''}
                        {lv === 'low' || lv === 'high' ? ` · ${t(`guide.lab.level.${lv}`)}` : ''}
                      </span>
                    );
                  })}
                </div>
              </li>
            ))}
        </ul>
      )}
      {open && <LabSheet blocks={blocks} onClose={() => setOpen(false)} />}
    </div>
  );
};

const LabSheet: React.FC<{ blocks: string[]; onClose: () => void }> = ({ blocks, onClose }) => {
  const { t } = useT();
  const today = todayStr();
  const [block, setBlock] = useState(blocks[0] || '');
  const [date, setDate] = useState(today);
  const [lab, setLab] = useState('');
  const [values, setValues] = useState<Partial<Record<LabKey, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!block) return setError(t('rec.hv.e.block'));
    if (!date || date > today) return setError(t('rec.e.date'));
    const parsed: Partial<Record<LabKey, number>> = {};
    for (const k of LAB_KEYS) {
      const raw = (values[k] || '').trim();
      if (!raw) continue;
      const n = Number(raw.replace(',', '.'));
      const r = LAB_RANGES[k];
      if (!Number.isFinite(n) || n < r.entryMin || n > r.entryMax) {
        return setError(t('rec.lab.e.range', { name: t(`guide.lab.${k}`), min: r.entryMin, max: r.entryMax }));
      }
      parsed[k] = n;
    }
    if (Object.keys(parsed).length === 0) return setError(t('rec.lab.e.empty'));
    setSaving(true);
    setError(null);
    try {
      await addLabResult({ block, date, lab: lab.trim() || undefined, values: parsed });
      onClose();
    } catch (e) {
      console.error('Lab result save failed:', e);
      setError(errorText(e, t));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={t('rec.lab.add')}
      subtitle={t('rec.lab.sheetHelp')}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p role="alert" className="text-xs text-rose-700 font-medium">{error}</p>}
          <button type="button" onClick={save} disabled={saving} className={`${primaryBtn} w-full min-h-12`}>
            {saving ? t('rec.saving') : t('rec.save')}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="lab-block" className={fieldLabel}>{t('common.block')}</label>
          <select id="lab-block" value={block} onChange={(e) => setBlock(e.target.value)} className={fieldInput}>
            {blocks.map((b) => (
              <option key={b} value={b}>{t('common.blockN', { n: b })}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lab-date" className={fieldLabel}>{t('rec.lab.date')}</label>
          <input id="lab-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={fieldInput} />
        </div>
      </div>
      <div>
        <label htmlFor="lab-name" className={fieldLabel}>{t('rec.lab.lab')}</label>
        <input id="lab-name" value={lab} onChange={(e) => setLab(e.target.value)} className={fieldInput} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {LAB_KEYS.map((k) => {
          const r = LAB_RANGES[k];
          return (
            <div key={k}>
              <label htmlFor={`lab-${k}`} className={fieldLabel}>
                {t(`guide.lab.${k}`)}
                {r.unit ? ` (${r.unit})` : ''}
              </label>
              <input
                id={`lab-${k}`}
                type="text"
                inputMode="decimal"
                value={values[k] || ''}
                placeholder={r.min !== undefined ? `${r.min}-${r.max}` : ''}
                onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                className={fieldInput}
              />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">{t('rec.lab.rangesNote')}</p>
    </Sheet>
  );
};

// ---------- weekly review (A7) ----------

/** "Reviewed 3 days ago · Mark reviewed": makes the Monday farm check a visible habit. */
export const WeeklyReview: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { t } = useT();
  const { weeklyReviewDate } = useFarm();
  const [error, setError] = useState<string | null>(null);
  const today = todayStr();
  const ago = weeklyReviewDate ? diffDays(today, weeklyReviewDate) : null;
  const due = ago === null || ago >= 7;
  const label =
    ago === null ? t('rec.review.never') : ago === 0 ? t('rec.review.today') : t('rec.review.ago', { n: ago });

  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span className={due ? 'text-amber-800 font-semibold' : 'text-slate-600'}>{label}</span>
      {ago !== 0 && (
        <button
          type="button"
          onClick={async () => {
            setError(null);
            try {
              await markWeeklyReview(today);
            } catch (e) {
              console.error('Weekly review save failed:', e);
              setError(errorText(e, t));
            }
          }}
          className={`${chip} bg-white border-slate-300 text-slate-800 hover:border-emerald-500`}
        >
          <Check className="w-3.5 h-3.5" />
          {t('rec.review.mark')}
        </button>
      )}
      {error && <span role="alert" className="basis-full text-xs text-rose-700">{error}</span>}
    </span>
  );
};

/** Pick helper for components that only have a task id. */
export const taskTitle = (task: SeasonTaskId, lang: 'id' | 'en') => pick(SEASON_TASKS[task].title, lang);
