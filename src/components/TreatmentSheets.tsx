import React, { useEffect, useState } from 'react';
import { Check, Undo2 } from 'lucide-react';
import { Sheet, fieldInput, fieldLabel } from './Sheet';
import { useFarm } from '../context/FarmContext';
import {
  PlanTemplate,
  ScheduleTask,
  TREATMENT_TYPE_LABELS,
  TreatmentPlan,
  TreatmentType,
  logTreatment,
  removeTreatment,
  savePlan,
  todayStr,
} from '../lib/treatments';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- undo toast ----------

export function useUndoToast() {
  const [toast, setToast] = useState<{ message: string; undo: () => Promise<void> } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(id);
  }, [toast]);
  return { toast, show: setToast, clear: () => setToast(null) };
}

export const UndoToast: React.FC<{
  toast: { message: string; undo: () => Promise<void> } | null;
  onClear: () => void;
}> = ({ toast, onClear }) => {
  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed z-50 left-4 right-4 md:left-auto md:right-6 bottom-20 md:bottom-6 md:w-96 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-900 text-white shadow-xl text-sm"
    >
      <span className="flex items-center gap-2">
        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
        {toast.message}
      </span>
      <button
        onClick={async () => {
          await toast.undo();
          onClear();
        }}
        className="flex items-center gap-1 font-semibold text-emerald-300 hover:text-emerald-200 min-h-11 px-2"
      >
        <Undo2 className="w-4 h-4" />
        Undo
      </button>
    </div>
  );
};

// ---------- mark done ----------

export const MarkDoneSheet: React.FC<{
  task: ScheduleTask;
  onClose: () => void;
  onSaved: (id: string, message: string) => void;
}> = ({ task, onClose, onSaved }) => {
  const { plan } = task;
  const [date, setDate] = useState(todayStr());
  const [selected, setSelected] = useState<string[]>(
    task.dueBlocks.length ? task.dueBlocks : task.blocks.map((b) => b.block)
  );
  const [product, setProduct] = useState(plan.product || '');
  const [dose, setDose] = useState(plan.dose || '');
  const [doneBy, setDoneBy] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (b: string) =>
    setSelected((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));

  const save = async () => {
    if (selected.length === 0) return setError('Select at least one block.');
    setSaving(true);
    setError(null);
    try {
      const id = await logTreatment({
        planId: plan.id,
        planName: plan.name,
        type: plan.type,
        date,
        blocks: selected,
        product,
        dose,
        doneBy,
        notes,
      });
      onSaved(id, `${plan.name} logged for Block ${selected.join(', ')}`);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save. Check your connection and the Firestore rules.');
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Mark as done"
      subtitle={plan.name}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-xs text-rose-700 font-medium">{error}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="w-full min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold"
          >
            {saving ? 'Saving…' : `Save for ${selected.length} block${selected.length === 1 ? '' : 's'}`}
          </button>
        </div>
      }
    >
      <div>
        <span className={fieldLabel}>Blocks done</span>
        <div className="flex flex-wrap gap-2">
          {task.blocks.map((b) => {
            const on = selected.includes(b.block);
            return (
              <button
                key={b.block}
                type="button"
                onClick={() => toggle(b.block)}
                aria-pressed={on}
                className={`min-h-11 px-4 rounded-full border text-sm font-semibold ${
                  on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-700'
                }`}
              >
                {on && <Check className="inline w-4 h-4 mr-1 -mt-0.5" />}Block {b.block}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel} htmlFor="md-date">Date done</label>
          <input id="md-date" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className={fieldInput} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="md-by">Done by</label>
          <input id="md-by" value={doneBy} onChange={(e) => setDoneBy(e.target.value)} placeholder="Name (optional)" className={fieldInput} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel} htmlFor="md-product">Product used</label>
          <input id="md-product" value={product} onChange={(e) => setProduct(e.target.value)} className={fieldInput} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="md-dose">Dose</label>
          <input id="md-dose" value={dose} onChange={(e) => setDose(e.target.value)} className={fieldInput} />
        </div>
      </div>
      <div>
        <label className={fieldLabel} htmlFor="md-notes">Notes</label>
        <textarea id="md-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={fieldInput} />
      </div>
      {plan.phiDays ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          Pre-harvest interval: {plan.phiDays} days. Do not harvest treated trees before then.
        </p>
      ) : null}
    </Sheet>
  );
};

export async function undoLogged(id: string) {
  await removeTreatment(id);
}

// ---------- routine editor ----------

export const PlanEditorSheet: React.FC<{
  plan?: TreatmentPlan;
  template?: PlanTemplate;
  onClose: () => void;
}> = ({ plan, template, onClose }) => {
  const { blocks } = useFarm();
  const base: Partial<TreatmentPlan> = plan || template || {};
  const [name, setName] = useState(base.name || '');
  const [type, setType] = useState<TreatmentType>(base.type || 'fertilizer');
  const [product, setProduct] = useState(base.product || '');
  const [dose, setDose] = useState(base.dose || '');
  const [allBlocks, setAllBlocks] = useState(plan ? plan.allBlocks : true);
  const [selBlocks, setSelBlocks] = useState<string[]>(plan?.blocks || []);
  const [everyDays, setEveryDays] = useState(String(base.everyDays || 30));
  const [seasonal, setSeasonal] = useState(Boolean(base.startMonth && base.endMonth));
  const [startMonth, setStartMonth] = useState(base.startMonth || 1);
  const [endMonth, setEndMonth] = useState(base.endMonth || 12);
  const [phi, setPhi] = useState(base.phiDays ? String(base.phiDays) : '');
  const [firstDue, setFirstDue] = useState(plan?.firstDue || todayStr());
  const [notes, setNotes] = useState(base.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const days = Number(everyDays);
    if (!name.trim()) return setError('Give the routine a name.');
    if (!Number.isFinite(days) || days < 1) return setError('"Repeat every" must be at least 1 day.');
    if (!allBlocks && selBlocks.length === 0) return setError('Choose at least one block.');
    setSaving(true);
    setError(null);
    try {
      await savePlan({
        id: plan?.id,
        name: name.trim(),
        type,
        product: product.trim(),
        dose: dose.trim(),
        allBlocks,
        blocks: allBlocks ? [] : selBlocks,
        everyDays: Math.round(days),
        startMonth: seasonal ? startMonth : undefined,
        endMonth: seasonal ? endMonth : undefined,
        phiDays: phi ? Number(phi) : undefined,
        stage: base.stage,
        notes: notes.trim(),
        firstDue,
        active: plan ? plan.active : true,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save. Check the Firestore rules.');
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={plan ? 'Edit routine' : 'New routine'}
      subtitle={template ? 'Starting point from a durian calendar. Adjust to your farm.' : undefined}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-xs text-rose-700 font-medium">{error}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="w-full min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold"
          >
            {saving ? 'Saving…' : 'Save routine'}
          </button>
        </div>
      }
    >
      <div>
        <label className={fieldLabel} htmlFor="pe-name">Name</label>
        <input id="pe-name" value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} placeholder="e.g. Fruit-set potassium feed" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel} htmlFor="pe-type">Type</label>
          <select id="pe-type" value={type} onChange={(e) => setType(e.target.value as TreatmentType)} className={fieldInput}>
            {Object.entries(TREATMENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={fieldLabel} htmlFor="pe-every">Repeat every (days)</label>
          <input id="pe-every" type="number" inputMode="numeric" min={1} value={everyDays} onChange={(e) => setEveryDays(e.target.value)} className={fieldInput} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel} htmlFor="pe-product">Product</label>
          <input id="pe-product" value={product} onChange={(e) => setProduct(e.target.value)} className={fieldInput} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="pe-dose">Dose</label>
          <input id="pe-dose" value={dose} onChange={(e) => setDose(e.target.value)} className={fieldInput} />
        </div>
      </div>

      <div>
        <span className={fieldLabel}>Applies to</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={allBlocks}
            onClick={() => setAllBlocks(true)}
            className={`min-h-11 px-4 rounded-full border text-sm font-semibold ${allBlocks ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}
          >
            All blocks
          </button>
          {blocks.map((b) => {
            const on = !allBlocks && selBlocks.includes(b);
            return (
              <button
                key={b}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setAllBlocks(false);
                  setSelBlocks((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
                }}
                className={`min-h-11 px-4 rounded-full border text-sm font-semibold ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}
              >
                Block {b}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 min-h-11">
          <input type="checkbox" checked={seasonal} onChange={(e) => setSeasonal(e.target.checked)} className="w-5 h-5 accent-emerald-600" />
          Only in a season
        </label>
        {seasonal && (
          <div className="grid grid-cols-2 gap-3 mt-1">
            <div>
              <label className={fieldLabel} htmlFor="pe-sm">From</label>
              <select id="pe-sm" value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))} className={fieldInput}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabel} htmlFor="pe-em">Until</label>
              <select id="pe-em" value={endMonth} onChange={(e) => setEndMonth(Number(e.target.value))} className={fieldInput}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel} htmlFor="pe-first">First due</label>
          <input id="pe-first" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} className={fieldInput} />
        </div>
        {type === 'spray' && (
          <div>
            <label className={fieldLabel} htmlFor="pe-phi">Pre-harvest interval (days)</label>
            <input id="pe-phi" type="number" inputMode="numeric" min={0} value={phi} onChange={(e) => setPhi(e.target.value)} className={fieldInput} />
          </div>
        )}
      </div>
      <div>
        <label className={fieldLabel} htmlFor="pe-notes">Notes</label>
        <textarea id="pe-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={fieldInput} />
      </div>
    </Sheet>
  );
};
