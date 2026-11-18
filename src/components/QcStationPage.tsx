import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { navigate, qcUrl } from '../lib/router';
import { saveTreeGrade } from '../lib/fieldData';
import { CRITERIA, MGMT, type QcKey, currentScores, sampleTotal } from '../lib/grading';
import type { FruitRow } from '../lib/fruits';
import { addDays, formatShortDate, todayStr } from '../lib/treatments';
import type { ReportPhoto } from '../types';
import { GradeTag, ScoreChip } from './HarvestBits';
import { LanguageToggle } from './Header';
import { Link } from './Link';
import { inputCls } from './PageHeader';
import { QcPhotos, SaveButton, type SaveState, ScoreSlider } from './QcBits';
import { useFruits, useVarietyName } from './useFruits';

/** How far back fruits wait for grading. */
const DAYS = 14;
const sampleId = (f: FruitRow) => `${f.harvest.id}-${f.index}`;
const shortCode = (code: string) => code.replace(/-\d{4}(\d{4})-/, '-$1-');
const NAME_KEY = 'cilowong.qc.by';
const readName = () => {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
};
const KEBUN = CRITERIA.filter((c) => c.from);

/**
 * The shop team's grading page (#/qc), on its own: the fruits picked in the last two weeks that nobody has graded,
 * the trees with no grade yet first; tap one, open the fruit, score the six shop criteria (the farm team's three come
 * from Laporan PANEN), save. The fruit's grading grades its tree (lib/grading.ts).
 */
export const QcStationPage: React.FC<{ fruitKey: string | null }> = ({ fruitKey }) => {
  const { t } = useT();
  const fruits = useFruits();
  const { treeGrades } = useFarm();
  const graded = useMemo(() => new Map(treeGrades.map((g) => [g.id, g])), [treeGrades]);
  const from = addDays(todayStr(), -DAYS);
  const recent = useMemo(() => fruits.filter((f) => f.date >= from && f.treeId), [fruits, from]);
  const f = fruitKey ? fruits.find((x) => x.key === fruitKey) : undefined;

  return (
    <div className="max-w-2xl mx-auto pb-10">
      <header className="sticky top-0 z-20 bg-slate-900 text-white">
        <div className="flex items-center gap-2 h-14 px-4">
          {fruitKey ? (
            <Link to={qcUrl()} replace className="-ml-2 p-2 rounded-lg hover:bg-slate-800" aria-label={t('qcs.back')}>
              <ArrowLeft className="w-5 h-5" />
            </Link>
          ) : null}
          <h1 className="font-bold text-base mr-auto">{t('qcs.title')}</h1>
          <LanguageToggle />
        </div>
      </header>
      {fruitKey ? (
        f ? (
          <GradeFruit key={f.key} f={f} existing={graded.get(sampleId(f))} />
        ) : (
          <p className="m-4 p-6 bg-white rounded-xl border border-slate-200 text-sm text-slate-600 text-center">{t('qcs.notFound')}</p>
        )
      ) : (
        <FruitList fruits={recent} graded={graded} />
      )}
    </div>
  );
};

/** The fruits waiting: trees with no grade first, then new fruits of graded trees; the ones done this fortnight folded. */
const FruitList: React.FC<{ fruits: FruitRow[]; graded: Map<string, any> }> = ({ fruits, graded }) => {
  const { t } = useT();
  const newest = (a: FruitRow, b: FruitRow) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key, undefined, { numeric: true });
  const todo = fruits.filter((f) => !graded.has(sampleId(f)));
  const noGrade = todo.filter((f) => !f.tg).sort(newest);
  const more = todo.filter((f) => f.tg).sort(newest);
  const done = fruits.filter((f) => graded.has(sampleId(f))).sort(newest);
  const [[flash, flashKey]] = useState(() => {
    try {
      const v = [sessionStorage.getItem('cilowong.qc.saved'), sessionStorage.getItem('cilowong.qc.savedKey')];
      sessionStorage.removeItem('cilowong.qc.saved');
      sessionStorage.removeItem('cilowong.qc.savedKey');
      return v;
    } catch {
      return [null, null];
    }
  });
  return (
    <div className="px-4 pt-4 space-y-5">
      {flash && (
        <p role="status" className="animate-pop flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-semibold text-emerald-900">
          <Check className="w-4 h-4" />
          {flash}
        </p>
      )}
      <p className="text-sm text-slate-600">{t('qcs.intro', { days: DAYS })}</p>
      <Section title={t('qcs.noGrade')} hint={t('qcs.noGrade.hint')} list={noGrade} tone="new" empty={t('qcs.noGrade.none')} />
      <Section title={t('qcs.more')} hint={t('qcs.more.hint')} list={more} />
      {done.length > 0 && (
        <details className="group" open={!!flashKey && done.some((f) => f.key === flashKey)}>
          <summary className="cursor-pointer list-none flex items-center gap-1.5 text-sm font-bold text-slate-700 py-1">
            <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
            {t('qcs.done', { n: done.length })}
          </summary>
          <div className="mt-2">
            <Cards list={done} graded={graded} lit={flashKey} />
          </div>
        </details>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; hint: string; list: FruitRow[]; tone?: 'new'; empty?: string }> = ({ title, hint, list, tone, empty }) => {
  if (!list.length && !empty) return null;
  return (
    <section>
      <h2 className={`text-sm font-bold ${tone === 'new' ? 'text-emerald-800' : 'text-slate-800'}`}>
        {title} <span className="font-normal text-slate-500">· {list.length}</span>
      </h2>
      <p className="text-xs text-slate-500 mb-2">{hint}</p>
      {list.length ? <Cards list={list} /> : <p className="p-4 bg-white rounded-xl border border-slate-200 text-sm text-slate-500 text-center">{empty}</p>}
    </section>
  );
};

const Cards: React.FC<{ list: FruitRow[]; graded?: Map<string, any>; lit?: string | null }> = ({ list, graded, lit }) => {
  const { t, locale } = useT();
  const variety = useVarietyName();
  const day = (d: string) => (d === todayStr() ? t('fr.today') : d === addDays(todayStr(), -1) ? t('fr.yesterday') : formatShortDate(d));
  return (
    <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {list.map((f) => {
        const mine = graded?.get(sampleId(f));
        const total = mine ? sampleTotal(mine) : undefined;
        return (
          <li key={f.key}>
            <Link to={qcUrl(f.key)} className={`flex items-center gap-3 px-3.5 py-3 hover:bg-slate-50 active:bg-slate-100 ${f.key === lit ? 'animate-flash' : ''}`}>
              <span className="w-14 shrink-0 font-mono text-lg font-bold text-slate-900">{f.treeId}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800 truncate">{variety(f.variant) || '—'}</span>
                <span className="block text-xs text-slate-500 tabular">
                  {day(f.date)} · {f.code ? shortCode(f.code) : ''} · {Math.round(f.weightG).toLocaleString(locale)} g
                </span>
              </span>
              {total ? <GradeTag grade={total.grade} pct={total.complete ? total.pct : undefined} /> : f.tg ? <GradeTag grade={f.tg.total.grade} /> : null}
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

/** One fruit: what the farm team scored, the six shop sliders, photos, a note, who graded; the total and save. */
const GradeFruit: React.FC<{ f: FruitRow; existing?: import('../lib/grading').TreeGrade }> = ({ f, existing }) => {
  const { t, locale } = useT();
  const variety = useVarietyName();
  const tree = String(f.treeId || '').toUpperCase();
  const kebun: Partial<Record<QcKey, number>> = {};
  for (const c of KEBUN) {
    const v = f[c.from!];
    if (Number.isFinite(v) && v >= 1 && v <= 5) kebun[c.key] = v;
  }
  const start = useMemo(() => {
    const s = currentScores(existing?.qc);
    return Object.fromEntries(MGMT.filter((c) => s[c.key] !== undefined).map((c) => [c.key, s[c.key]])) as Partial<Record<QcKey, number>>;
  }, [existing]);
  const [qc, setQc] = useState(start);
  const [note, setNote] = useState(existing?.note || '');
  const [photos, setPhotos] = useState<ReportPhoto[]>(existing?.photos || []);
  const [uploading, setUploading] = useState(0);
  const [by, setBy] = useState(existing?.by || readName());
  const [state, setState] = useState<SaveState>('idle');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const total = sampleTotal({ qc: { ...kebun, ...qc } });
  const shopDone = MGMT.every((c) => qc[c.key] !== undefined);
  const save = async () => {
    setState('saving');
    try {
      const name = by.trim().slice(0, 40);
      try {
        if (name) localStorage.setItem(NAME_KEY, name);
      } catch {
        /* not kept: asked again next time */
      }
      await saveTreeGrade(sampleId(f), {
        treeId: tree,
        date: f.date,
        qc: { ...kebun, ...qc },
        by: name || undefined,
        note: note.trim().slice(0, 300) || undefined,
        photos: photos.length ? photos : undefined,
        fruitKey: `${f.harvest.id}/${f.index}`,
        fruitCode: f.code,
        weightG: Math.round(f.weightG),
        from: 'toko',
      });
      try {
        const g = sampleTotal({ qc: { ...kebun, ...qc } });
        sessionStorage.setItem('cilowong.qc.saved', t('qcs.saved', { tree, grade: t(`qc.grade.${g.grade}`), pct: g.pct.toLocaleString(locale) }));
        sessionStorage.setItem('cilowong.qc.savedKey', f.key);
      } catch {
        /* no message, the list still shows it graded */
      }
      // The tick shows for a moment, then back to the list, where the fruit lights up under "Sudah dinilai".
      setState('saved');
      setTimeout(() => navigate(qcUrl(), { replace: true }), 1100);
    } catch (e) {
      console.error('Shop grading save failed:', e);
      setState('error');
    }
  };

  return (
    <div>
      <div className="px-4 pt-4 pb-3 bg-white border-b border-slate-200">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-2xl font-bold text-slate-900">{tree}</span>
          <span className="text-base font-semibold text-slate-700">{variety(f.variant)}</span>
          {f.tg && <span className="ml-auto"><GradeTag grade={f.tg.total.grade} /></span>}
        </div>
        <p className="text-sm text-slate-500 tabular">
          {formatShortDate(f.date)} · {f.code ? shortCode(f.code) : ''} · {Math.round(f.weightG).toLocaleString(locale)} g
        </p>
        <div className="mt-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('qc.g.kebun')} · 15%</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
            {KEBUN.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1.5">
                {t(`qc.c.${c.key}`)} <ScoreChip v={kebun[c.key] ?? NaN} />
              </span>
            ))}
          </div>
        </div>
      </div>
      <fieldset className="px-4 py-2 bg-white mt-3 border-y border-slate-200">
        <legend className="sr-only">{t('qc.g.toko')}</legend>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 pt-2">{t('qc.g.toko')} · 85%</p>
        <p className="text-xs text-slate-500 pb-1">{t('qcs.howTo')}</p>
        {MGMT.map((c) => (
          <ScoreSlider
            key={c.key}
            big
            c={c}
            v={qc[c.key]}
            set={(n) => {
              setQc((x) => (n === undefined ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== c.key)) : { ...x, [c.key]: n }));
              setState('idle');
            }}
          />
        ))}
      </fieldset>
      <div className="px-4 py-3 bg-white mt-3 border-y border-slate-200 space-y-3">
        <QcPhotos photos={photos} setPhotos={setPhotos} uploading={uploading} setUploading={setUploading} tree={tree} name={sampleId(f)} />
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-800">{t('qc.note')}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} placeholder={t('qc.note.ph')} className={`${inputCls} !h-auto py-2`} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-slate-800">{t('qcs.by')}</span>
          <input value={by} onChange={(e) => setBy(e.target.value)} maxLength={40} placeholder={t('qcs.by.ph')} className={inputCls} autoComplete="name" />
        </label>
      </div>
      <div className="sticky bottom-0 z-10 mt-3 px-4 py-3 border-t border-slate-200 bg-white/95 backdrop-blur flex items-center gap-2 flex-wrap pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <span className="text-sm text-slate-700 tabular mr-auto">
          {t('qc.total')} <strong className="text-lg text-slate-900">{total.pct.toLocaleString(locale, { maximumFractionDigits: 1 })}%</strong>
          {total.complete ? (
            <span className="ml-1.5 align-middle"><GradeTag grade={total.grade} /></span>
          ) : (
            <span className="text-xs text-slate-500"> · {t('qc.progress', { n: MGMT.filter((c) => qc[c.key] !== undefined).length, total: MGMT.length })}</span>
          )}
        </span>
        <SaveButton big state={state} onClick={save} disabled={!shopDone || uploading > 0 || !tree || state === 'saved'} label={t('qcs.save')} />
        {!shopDone && <span className="w-full text-xs text-slate-500">{t('qcs.allSix')}</span>}
        {state === 'error' && <span role="alert" className="w-full text-xs text-rose-700">{t('fr.saveError')}</span>}
      </div>
    </div>
  );
};
