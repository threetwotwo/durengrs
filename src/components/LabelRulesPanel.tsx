import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useT } from '../i18n';
import { saveLabelRules, type StoredLabelRules } from '../lib/labelRules';
import { formatShortDate, toDateStr } from '../lib/treatments';
import {
  DEFAULT_LABEL_RULES,
  checkLabelRules,
  doseSuggestion,
  labelBatang,
  labelEst,
  labelFruitset,
  labelTajuk,
  type LabelRules,
} from '../shared';
import { btnPrimary, btnSecondary } from './PageHeader';

/** One tree's measurements, to show how many labels and doses a change would move. */
export interface RuleSample {
  girth?: number;
  canopy?: number;
  est?: number;
  fruit?: number;
}

const NUM_PATHS = [
  'batang.skipMax',
  'batang.lowMax',
  'batang.midMax',
  'tajuk.lowMax',
  'tajuk.midMax',
  'est.skipMax',
  'est.lowMax',
  'est.midMax',
  'fruitset.lowMax',
  'fruitset.midMax',
  'dose.fruiting.low',
  'dose.fruiting.mid',
  'dose.fruiting.high',
  'dose.vegetative.high',
  'dose.vegetative.other',
  'dose.young',
] as const;
const TEXT_PATHS = ['dose.unit', 'products.fruiting', 'products.vegetative', 'products.young'] as const;
type Path = (typeof NUM_PATHS)[number] | (typeof TEXT_PATHS)[number];

const get = (r: LabelRules, p: Path): unknown => p.split('.').reduce<any>((o, k) => o?.[k], r);
const toText = (r: LabelRules) => Object.fromEntries([...NUM_PATHS, ...TEXT_PATHS].map((p) => [p, String(get(r, p) ?? '')])) as Record<Path, string>;
const parseNum = (s: string) => {
  const t = s.trim().replace(',', '.');
  const n = t === '' ? NaN : Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
function fromText(text: Record<Path, string>, confirmed: boolean): LabelRules {
  const r: any = structuredClone(DEFAULT_LABEL_RULES);
  for (const p of NUM_PATHS) {
    const keys = p.split('.');
    keys.slice(0, -1).reduce((o, k) => o[k], r)[keys[keys.length - 1]] = parseNum(text[p]);
  }
  for (const p of TEXT_PATHS) {
    const keys = p.split('.');
    keys.slice(0, -1).reduce((o, k) => o[k], r)[keys[keys.length - 1]] = text[p].trim().slice(0, 60);
  }
  r.confirmed = confirmed;
  return r as LabelRules;
}

const readBy = () => {
  try {
    return localStorage.getItem('cilowong.by') || '';
  } catch {
    return '';
  }
};

/**
 * The owner's label thresholds and doses, editable in place. Saved for the whole farm (web app and bot); shows how
 * many trees' labels and doses a change would move before saving.
 */
export const LabelRulesPanel: React.FC<{ stored: StoredLabelRules; samples: RuleSample[] }> = ({ stored, samples }) => {
  const { t } = useT();
  const current = stored.rules;
  const [text, setText] = useState(() => toText(current));
  const [confirmed, setConfirmed] = useState(current.confirmed);
  const [by, setBy] = useState(readBy);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  // The person has typed in the form since it last matched the stored values.
  const [touched, setTouched] = useState(false);
  // A value changed after the rules were confirmed: the tick is taken off until someone checks again.
  const [unticked, setUnticked] = useState(false);

  const draft = useMemo(() => fromText(text, confirmed), [text, confirmed]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(current);
  // Follow the stored values (first load, or another device saved) unless the person is editing. Never compare with
  // "dirty" here: on first load the form still holds the sheet's values, which differ from the saved ones.
  useEffect(() => {
    if (!touched) {
      setText(toText(current));
      setConfirmed(current.confirmed);
      setUnticked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const edit = (p: Path, value: string) => {
    setText((prev) => ({ ...prev, [p]: value }));
    setTouched(true);
    setMsg(null);
    if (confirmed) {
      setConfirmed(false);
      setUnticked(true);
    }
  };
  const reset = () => {
    setText(toText(current));
    setConfirmed(current.confirmed);
    setTouched(false);
    setUnticked(false);
  };

  const errors = checkLabelRules(draft);
  const badPaths = new Set<Path>(NUM_PATHS.filter((p) => Number.isNaN(parseNum(text[p]))));

  // How many trees this change moves.
  const moved = useMemo(() => {
    let labels = 0;
    let doses = 0;
    const of = (r: LabelRules, s: RuleSample) => {
      const l = { batang: labelBatang(s.girth, r), tajuk: labelTajuk(s.canopy, r), est: labelEst(s.est, r), fruitset: labelFruitset(s.fruit, r) };
      return { l, d: doseSuggestion(l, r) };
    };
    for (const s of samples) {
      const a = of(current, s);
      const b = of(draft, s);
      if (JSON.stringify(a.l) !== JSON.stringify(b.l)) labels++;
      if (JSON.stringify(a.d) !== JSON.stringify(b.d)) doses++;
    }
    return { labels, doses };
  }, [samples, current, draft]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const who = by.trim();
      try {
        localStorage.setItem('cilowong.by', who);
      } catch {
        /* per-device convenience only */
      }
      await saveLabelRules(draft, current, who || undefined);
      setTouched(false);
      setUnticked(false);
      setMsg({ ok: true, text: t('rules.saved') });
    } catch (e: any) {
      console.error('Saving label rules failed:', e);
      setMsg({ ok: false, text: e?.code === 'permission-denied' ? t('err.rulesRecords') : t('kebun.saveError') });
    } finally {
      setBusy(false);
    }
  };

  const num = (p: (typeof NUM_PATHS)[number], label: string) => (
    <input
      value={text[p]}
      onChange={(e) => edit(p, e.target.value)}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={badPaths.has(p) || undefined}
      className={`w-16 sm:w-20 min-h-10 px-2 rounded-lg border text-sm text-right tabular ${badPaths.has(p) ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white'}`}
    />
  );
  const str = (p: (typeof TEXT_PATHS)[number], label: string, w = 'w-36') => (
    <input
      value={text[p]}
      onChange={(e) => edit(p, e.target.value)}
      aria-label={label}
      placeholder={p === 'dose.unit' ? 'kg' : ''}
      className={`${w} min-h-10 px-2 rounded-lg border border-slate-300 bg-white text-sm`}
    />
  );
  const cell = 'py-1.5 pr-2 sm:pr-3';
  const head = 'pb-1 pr-2 sm:pr-3 text-xs font-semibold text-slate-500 text-left';
  const name = (k: 'batang' | 'tajuk' | 'est' | 'fruitset') => t(`kebun.lab.${k}`);

  return (
    <section className="bg-white rounded-xl border border-slate-200" aria-labelledby="rules-h">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full p-4 flex flex-wrap items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-slate-500" />
          <span id="rules-h" className="font-semibold text-slate-900">
            {t('kebun.rules')}
          </span>
          {current.confirmed ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('rules.confirmed')}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">{t('rules.unconfirmed')}</span>
          )}
        </span>
        <span className="text-xs text-slate-500">
          {stored.saved && stored.updatedAt
            ? t(stored.updatedBy ? 'rules.changedBy' : 'rules.changed', { by: stored.updatedBy || '', date: formatShortDate(toDateStr(new Date(stored.updatedAt))) })
            : t('rules.fromSheet')}
        </span>
      </button>

      {open && (
        // Nothing can be typed until the saved rules have arrived, so an edit never starts from the sheet's values.
        <fieldset disabled={stored.loading} aria-busy={stored.loading || undefined} className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4 disabled:opacity-60">
          <p className="text-xs text-slate-600">{t('rules.help')}</p>

          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  <th className={head} />
                  <th className={head}>{t('kebun.label.skip')} ≤</th>
                  <th className={head}>{t('kebun.label.low')} ≤</th>
                  <th className={head}>{t('kebun.label.mid')} ≤</th>
                  <th className={head}>{t('kebun.label.high')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className={`${cell} text-left font-semibold whitespace-nowrap`}>{name('batang')} (cm)</th>
                  <td className={cell}>{num('batang.skipMax', `${name('batang')} skip`)}</td>
                  <td className={cell}>{num('batang.lowMax', `${name('batang')} low`)}</td>
                  <td className={cell}>{num('batang.midMax', `${name('batang')} mid`)}</td>
                  <td className={`${cell} text-slate-500 tabular`}>&gt; {text['batang.midMax']}</td>
                </tr>
                <tr>
                  <th className={`${cell} text-left font-semibold whitespace-nowrap`}>{name('tajuk')} (cm)</th>
                  <td className={`${cell} text-slate-400`}>—</td>
                  <td className={cell}>{num('tajuk.lowMax', `${name('tajuk')} low`)}</td>
                  <td className={cell}>{num('tajuk.midMax', `${name('tajuk')} mid`)}</td>
                  <td className={`${cell} text-slate-500 tabular`}>&gt; {text['tajuk.midMax']}</td>
                </tr>
                <tr>
                  <th className={`${cell} text-left font-semibold whitespace-nowrap`}>{name('est')}</th>
                  <td className={cell}>{num('est.skipMax', `${name('est')} skip`)}</td>
                  <td className={cell}>{num('est.lowMax', `${name('est')} low`)}</td>
                  <td className={cell}>{num('est.midMax', `${name('est')} mid`)}</td>
                  <td className={`${cell} text-slate-500 tabular`}>&gt; {text['est.midMax']}</td>
                </tr>
                <tr>
                  <th className={`${cell} text-left font-semibold whitespace-nowrap`}>{name('fruitset')}</th>
                  <td className={`${cell} text-slate-500 tabular`}>0</td>
                  <td className={cell}>{num('fruitset.lowMax', `${name('fruitset')} low`)}</td>
                  <td className={cell}>{num('fruitset.midMax', `${name('fruitset')} mid`)}</td>
                  <td className={`${cell} text-slate-500 tabular`}>&gt; {text['fruitset.midMax']}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 flex flex-wrap items-center gap-2">
              {t('rules.dose')}
              <label className="inline-flex items-center gap-2 text-xs font-normal text-slate-600">
                {t('rules.unit')} {str('dose.unit', t('rules.unit'), 'w-24')}
              </label>
            </p>
            <div className="grid gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-full sm:w-56 text-slate-700">{t('rules.fruiting')}</span>
                <Pair label="low">{num('dose.fruiting.low', `${t('rules.fruiting')} low`)}</Pair>
                <Pair label="mid">{num('dose.fruiting.mid', `${t('rules.fruiting')} mid`)}</Pair>
                <Pair label="high">{num('dose.fruiting.high', `${t('rules.fruiting')} high`)}</Pair>
                {str('products.fruiting', `${t('rules.product')}: ${t('rules.fruiting')}`)}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-full sm:w-56 text-slate-700">{t('rules.vegetative')}</span>
                <Pair label="high">{num('dose.vegetative.high', `${t('rules.vegetative')} high`)}</Pair>
                <Pair label={t('rules.other')}>{num('dose.vegetative.other', `${t('rules.vegetative')} ${t('rules.other')}`)}</Pair>
                {str('products.vegetative', `${t('rules.product')}: ${t('rules.vegetative')}`)}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-full sm:w-56 text-slate-700">{t('rules.young')}</span>
                {num('dose.young', t('rules.young'))}
                {str('products.young', `${t('rules.product')}: ${t('rules.young')}`)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => {
                  setConfirmed(e.target.checked);
                  setTouched(true);
                  setUnticked(false);
                }}
                className="w-4 h-4 accent-emerald-600"
              />
              {t('rules.confirm')}
            </label>
            {unticked && <span className="text-xs text-amber-800">{t('rules.unconfirmedAgain')}</span>}
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              {t('inbox.by')}
              <input value={by} onChange={(e) => setBy(e.target.value)} className="w-36 min-h-10 px-2 rounded-lg border border-slate-300 text-sm" />
            </label>
          </div>

          {errors.length > 0 && (
            <ul role="alert" className="text-sm text-rose-700 space-y-0.5">
              {errors.map((e, i) => (
                <li key={i}>{t(e.key, e.vars?.name ? { name: t(`kebun.lab.${e.vars.name}`) } : e.vars)}</li>
              ))}
            </ul>
          )}
          {dirty && errors.length === 0 && <p className="text-sm text-slate-700">{t('rules.preview', { labels: moved.labels, doses: moved.doses, n: samples.length })}</p>}
          {msg && (
            <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
              {msg.text}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={stored.loading || !dirty || errors.length > 0 || busy} onClick={save} className={`${btnPrimary} disabled:opacity-50`}>
              {busy ? t('kebun.paste.saving') : t('rules.save')}
            </button>
            {dirty && (
              <button type="button" onClick={reset} className={btnSecondary}>
                {t('rules.cancel')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setText(toText(DEFAULT_LABEL_RULES));
                setConfirmed(false);
                setTouched(true);
              }}
              className={`${btnSecondary} text-slate-600`}
            >
              <RotateCcw className="w-4 h-4" />
              {t('rules.defaults')}
            </button>
          </div>
          <p className="text-xs text-slate-500">{t('rules.where')}</p>
        </fieldset>
      )}
    </section>
  );
};

/** A small label kept on the same line as its input when the row wraps. */
const Pair: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <span className="inline-flex items-center gap-1.5 text-slate-600">
    {label}
    {children}
  </span>
);
