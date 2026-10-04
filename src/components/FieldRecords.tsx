import React, { useMemo, useState } from 'react';
import { Check, CloudRain, FlaskConical, Plus, Sun, Trash2, Wheat } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { useSeasons } from './useSeasons';
import { useGuideOn } from '../lib/guideMode';
import { Sheet, fieldInput, fieldLabel } from './Sheet';
import { Link } from './Link';
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
  removeHarvest,
  removeLabResult,
  saveRain,
  unmarkSeasonTask,
} from '../lib/fieldData';
import {
  LAB_RANGES,
  SEASON_TASKS,
  actualRipening,
  blockTasks,
  type BlockTask,
  harvestQuality,
  labLevel,
  latestLabByBlock,
  rainSummary,
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
        return (
          <button
            key={key}
            type="button"
            disabled={busy === key}
            onClick={() => toggle(s, bt, key)}
            aria-pressed={done}
            title={done ? t('rec.task.undo') : t('rec.task.mark')}
            className={`${chip} ${
              done
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : late
                ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                : 'bg-white border-slate-300 text-slate-800 hover:border-emerald-500'
            }`}
          >
            {done && <Check className="w-3.5 h-3.5" />}
            {done
              ? t('rec.task.done', { block: label, date: formatShortDate(bt.doneDate!) })
              : late
              ? t('rec.task.late', { block: label })
              : t('rec.task.todo', { block: label })}
          </button>
        );
      })}
      {error && <span role="alert" className="basis-full text-xs text-rose-700">{error}</span>}
    </span>
  );
};

// ---------- rain (A15) ----------

/** Read the gauge, type one number (or tap "No rain"). Shows 14 days and the dry-spell trigger. */
export const RainCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t } = useT();
  const guideOn = useGuideOn();
  const { rain } = useFarm();
  const today = todayStr();
  const [date, setDate] = useState(today);
  const [mm, setMm] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; msg?: string }>({ kind: 'idle' });
  const summary = useMemo(() => rainSummary(rain, today), [rain, today]);
  const max = Math.max(10, ...summary.last14.map((d) => d.mm || 0));
  const recordedToday = rain.find((d) => d.date === date);

  const save = async (value: number) => {
    if (!Number.isFinite(value) || value < 0 || value > 400) {
      setState({ kind: 'error', msg: t('rec.rain.range') });
      return;
    }
    setState({ kind: 'saving' });
    try {
      await saveRain(date, Math.round(value * 10) / 10);
      setMm('');
      setState({ kind: 'saved' });
    } catch (e) {
      console.error('Rain save failed:', e);
      setState({ kind: 'error', msg: errorText(e, t) });
    }
  };

  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3 ${className}`} aria-labelledby="rain-h">
      <div className="flex items-center justify-between gap-2">
        <h2 id="rain-h" className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <CloudRain className="w-4 h-4 text-sky-600" />
          {t('rec.rain.title')}
        </h2>
        {guideOn && <Link to="/guide/water" className="text-xs font-semibold text-emerald-700">{t('rec.why')} →</Link>}
      </div>

      <div className="flex items-end gap-1 h-16" role="img" aria-label={t('rec.rain.chart')}>
        {summary.last14.map((d) => (
          <span key={d.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${formatShortDate(d.date)}: ${d.mm === null ? '—' : `${d.mm} mm`}`}>
            {d.mm === null ? (
              <span className="w-full h-1 rounded bg-slate-200" />
            ) : (
              <span className="w-full rounded-t bg-sky-500" style={{ height: `${Math.max(3, (d.mm / max) * 100)}%` }} />
            )}
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-600 tabular">
        {t('rec.rain.total30', { mm: Math.round(summary.total30) })}
        {summary.lastDate ? ` · ${t('rec.rain.last', { date: formatShortDate(summary.lastDate) })}` : ''}
      </p>
      {summary.dry && summary.drySince && summary.expectedBloom && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2">
          {t('rec.rain.dry', { since: formatShortDate(summary.drySince), bloom: formatShortDate(summary.expectedBloom) })}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="rain-date" className={fieldLabel}>{t('rec.date')}</label>
          <input id="rain-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="min-h-11 px-2 rounded-lg border border-slate-300 text-sm" />
        </div>
        <div className="w-24">
          <label htmlFor="rain-mm" className={fieldLabel}>{t('rec.rain.mm')}</label>
          <input
            id="rain-mm"
            type="text"
            inputMode="decimal"
            value={mm}
            placeholder={recordedToday ? String(recordedToday.rainMm) : '0'}
            onChange={(e) => {
              setMm(e.target.value);
              setState({ kind: 'idle' });
            }}
            className="w-full min-h-11 px-2 rounded-lg border border-slate-300 text-sm font-mono"
          />
        </div>
        <button type="button" disabled={!mm.trim() || state.kind === 'saving'} onClick={() => save(Number(mm.replace(',', '.')))} className={`${chip} min-h-11 bg-emerald-600 border-emerald-600 text-white disabled:opacity-50`}>
          {t('rec.save')}
        </button>
        <button type="button" disabled={state.kind === 'saving'} onClick={() => save(0)} className={`${chip} min-h-11 bg-white border-slate-300 text-slate-800 hover:border-emerald-500`}>
          <Sun className="w-3.5 h-3.5 text-amber-500" />
          {t('rec.rain.none')}
        </button>
      </div>
      {state.kind === 'saved' && <p role="status" className="text-xs text-emerald-700">{t('rec.rain.saved', { date: formatShortDate(date) })}</p>}
      {state.kind === 'error' && <p role="alert" className="text-xs text-rose-700">{state.msg}</p>}
      {recordedToday && state.kind !== 'saved' && (
        <p className="text-xs text-slate-500">{t('rec.rain.already', { mm: recordedToday.rainMm })}</p>
      )}
    </section>
  );
};

// ---------- harvest log (A6) ----------

export const HarvestLog: React.FC = () => {
  const { t } = useT();
  const { harvests, variants } = useFarm();
  const [open, setOpen] = useState(false);
  const real = useMemo(() => actualRipening(harvests), [harvests]);
  const quality = useMemo(() => harvestQuality(harvests, (h) => h.variant), [harvests]);
  const nameOf = (code: string) => variants.find((v) => v.code === code)?.name || code;

  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden" aria-labelledby="hv-log">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="hv-log" className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Wheat className="w-4 h-4 text-emerald-600" />
            {t('rec.hv.title')}
          </h2>
          <p className="text-xs text-slate-600">{t('rec.hv.help')}</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className={primaryBtn}>
          <Plus className="w-4 h-4" />
          {t('rec.hv.add')}
        </button>
      </div>

      {quality.size > 0 && (
        <div className="p-4 border-b border-slate-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="text-left font-semibold py-1">{t('common.variant')}</th>
                <th className="text-right font-semibold py-1">{t('rec.hv.fruits')}</th>
                <th className="text-right font-semibold py-1">{t('rec.hv.problemRate')}</th>
                <th className="text-right font-semibold py-1">{t('rec.hv.realDays')}</th>
                <th className="text-right font-semibold py-1">{t('rec.hv.setDays')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from(quality.entries()).map(([code, q]) => {
                const r = real.get(code);
                const set = Number(variants.find((v) => v.code === code)?.ripeningDays) || null;
                return (
                  <tr key={code}>
                    <td className="py-1.5 font-semibold text-slate-900">{nameOf(code)}</td>
                    <td className="py-1.5 text-right tabular">{q.fruits.toLocaleString()}</td>
                    <td className="py-1.5 text-right tabular">{q.fruits ? Math.round((q.problemFruits / q.fruits) * 100) : 0}%</td>
                    <td className="py-1.5 text-right tabular">{r ? t('rec.hv.daysN', { n: r.days, h: r.harvests }) : '—'}</td>
                    <td className="py-1.5 text-right tabular">
                      {set ?? '—'}
                      {r && set && Math.abs(r.days - set) > 3 && (
                        <Link to={`/variants?edit=${encodeURIComponent(code)}`} className="ml-1.5 text-xs font-semibold text-amber-800 underline">
                          {t('rec.hv.update')}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {harvests.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-600">{t('rec.hv.empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {harvests.slice(0, 15).map((h) => (
            <li key={h.id} className="flex items-start gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-semibold text-slate-900">
                  {formatShortDate(h.date)} · {h.treeId ? t('rep.treeN', { id: h.treeId }) : t('common.blockN', { n: h.block })} · {nameOf(h.variant)}
                </span>
                <span className="block text-xs text-slate-600 tabular">
                  {t('rec.hv.line', { n: h.fruits })}
                  {h.grades ? ` (${GRADES.filter((g) => h.grades![g]).map((g) => `${t(`grade.${g}.short`)} ${h.grades![g]}`).join(', ')})` : ''}
                  {h.weightKg ? ` · ${h.weightKg} kg` : ''}
                  {typeof h.daysFromBloom === 'number' ? ` · ${t('rec.hv.dayN', { n: h.daysFromBloom })}` : ''}
                  {h.problems?.length ? ` · ${h.problems.map((p) => t(`rec.hv.p.${p}`)).join(', ')}${h.problemFruits ? ` (${h.problemFruits})` : ''}` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => window.confirm(t('rec.hv.confirmDelete')) && removeHarvest(h.id)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label={t('rec.delete')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <HarvestSheet onClose={() => setOpen(false)} />}
    </section>
  );
};

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
  const { t } = useT();
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
    if (!date || date > today) return setError(t('rec.e.date'));
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 5000)) return setError(t('rec.hv.e.grade'));
    if (total < 1 || total > 5000) return setError(t('rec.hv.e.fruits'));
    if (w !== undefined && (!Number.isFinite(w) || w <= 0 || w > 20000)) return setError(t('rec.hv.e.weight'));
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
        problemFruits: graded.reject || undefined,
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
            <option value="">{t('rec.hv.wholeBlock')}</option>
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
                max={5000}
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
      {(Number(grades.reject) > 0 || problems.length > 0) && (
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
