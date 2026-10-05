import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardPaste, Columns3, Download, Search } from 'lucide-react';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { treeUrl, useQueryParams } from '../lib/router';
import { formatShortDate } from '../lib/treatments';
import { improvingNow, plantedDateStr } from '../lib/trees';
import { parseNum } from '../lib/num';
import { type EditField, cellText, checkCell, countDates, countGrid, sameValue, toCsv, treeDraft } from '../lib/kebun';
import type { TreeCrop } from '../lib/crop';
import {
  FARM_STAGES,
  FARM_STAGE_INFO,
  HEALTH,
  HEALTH_INFO,
  doseSuggestion,
  healthOf,
  labelBatang,
  labelEst,
  labelFruitset,
  labelTajuk,
  type Health,
  type Label,
  ENGINE_STAGE_WORDS,
} from '../shared';
import type { DurianTree } from '../types';
import { PageHeader, btnSecondary, inputCls } from './PageHeader';
import { Link } from './Link';
import { TreeStageCell, observedNow } from './StageBoard';
import { HealthPill } from './FieldStage';
import { useCrops } from './useCrops';
import { KebunPasteSheet } from './KebunPaste';
import { LabelRulesPanel, type RuleSample } from './LabelRulesPanel';
import { useLabelRules } from '../lib/labelRules';

/**
 * Kebun: the whole farm as one sheet, one row per tree, in the owner's columns (size, flowering and fruit, dated
 * counts, stage, health, labels, dose, notes). Type into a cell like in Google Sheets; every change is saved and
 * logged like the tree form. Paste from Google Sheets to update many cells at once; export what's shown as CSV.
 */

type Group = 'tree' | 'size' | 'crop' | 'counts' | 'stage' | 'health' | 'label' | 'dose' | 'notes';
const GROUPS: Group[] = ['tree', 'size', 'crop', 'counts', 'stage', 'health', 'label', 'dose', 'notes'];
const HIDDEN_KEY = 'kebun.hidden';

interface Row {
  tree: DurianTree;
  crop?: TreeCrop;
  counts?: Map<string, { count: number; stage: string }>;
  health: Health | null;
  /** Fruit on the tree now: last fruit count minus what was picked since, else the tree's estimate. */
  fruitNow?: number;
  labels: { batang?: Label; tajuk?: Label; est?: Label; fruitset?: Label };
  dose?: { product: string; dose: number };
}

interface Col {
  key: string;
  group: Group;
  label: string;
  title?: string;
  edit?: EditField;
  right?: boolean;
  sort?: (r: Row) => number | string | undefined;
  csv: (r: Row) => string | number | undefined;
  cell?: (r: Row) => React.ReactNode;
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseNum(String(v ?? ''));
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? undefined : n;
};
const idOrder = (a: DurianTree, b: DurianTree) => a.block.localeCompare(b.block) || a.id.localeCompare(b.id, undefined, { numeric: true });

function readHidden(): Set<Group> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

const LABEL_CLS: Record<Label, string> = {
  low: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  mid: 'bg-emerald-200 text-emerald-900 border-emerald-300',
  high: 'bg-emerald-700 text-white border-emerald-700',
  skip: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const KebunPage: React.FC = () => {
  const { t, lang } = useT();
  const { trees, cropCounts, updateTree } = useFarm();
  const { crops } = useCrops();
  const [params, setParams] = useQueryParams();
  const [hidden, setHidden] = useState<Set<Group>>(readHidden);
  const [showCols, setShowCols] = useState(false);
  const [pasting, setPasting] = useState(false);
  // typed: the edit started with a keystroke (the cell holds that key; keep the caret after it rather than selecting it).
  const [editing, setEditing] = useState<{ treeId: string; field: EditField; text: string; typed?: boolean } | null>(null);
  const [cellError, setCellError] = useState<{ treeId: string; field: EditField; msg: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // Enter then blur would commit the same edit twice: remember the last one committed.
  const committed = useRef<typeof editing>(null);

  const q = (params.get('q') || '').trim().toUpperCase();
  const block = params.get('block') || '';
  const stage = params.get('stage') || '';
  const health = params.get('health') || '';
  const sortKey = params.get('sort') || '';
  const desc = params.get('dir') === 'desc';

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
    } catch {
      /* per-device convenience only */
    }
  }, [hidden]);

  // The owner's label and dose rules, as saved for the farm (the sheet's values until changed).
  const stored = useLabelRules();
  const rules = stored.rules;
  const dates = useMemo(() => countDates(cropCounts), [cropCounts]);
  const grid = useMemo(() => countGrid(cropCounts), [cropCounts]);
  const cropById = useMemo(() => new Map(crops.map((c) => [c.tree.id, c])), [crops]);

  const rows: Row[] = useMemo(
    () =>
      [...trees].sort(idOrder).map((tree) => {
        const crop = cropById.get(tree.id);
        const fruitNow = crop?.remaining ?? num(tree.estimatedFruitCount);
        const labels = {
          batang: labelBatang(num(tree.trunkSize), rules),
          tajuk: labelTajuk(num(tree.canopySize), rules),
          est: labelEst(num(tree.floweringClusters), rules),
          fruitset: labelFruitset(fruitNow, rules),
        };
        return { tree, crop, counts: grid.get(tree.id), health: healthOf(tree.condition), fruitNow, labels, dose: doseSuggestion(labels, rules) };
      }),
    [trees, cropById, grid, rules]
  );
  const samples: RuleSample[] = useMemo(
    () => rows.map((r) => ({ girth: num(r.tree.trunkSize), canopy: num(r.tree.canopySize), est: num(r.tree.floweringClusters), fruit: r.fruitNow })),
    [rows]
  );

  const labelChip = (l?: Label) =>
    l ? <span className={`inline-block px-1.5 py-0.5 rounded border text-[11px] font-bold ${LABEL_CLS[l]}`}>{t(`kebun.label.${l}`)}</span> : null;
  const stageText = (r: Row) => {
    const seen = observedNow(r.tree);
    if (seen && !seen.stale) return FARM_STAGE_INFO[seen.code].label[lang];
    const exp = r.crop?.waves[0]?.stage;
    return exp ? `(${ENGINE_STAGE_WORDS[exp][lang]})` : '';
  };

  const cols: Col[] = useMemo(() => {
    const field = (key: EditField, group: Group, label: string, right = true, title?: string): Col => ({
      key,
      group,
      label,
      title,
      edit: key,
      right,
      sort: (r) => (key === 'notes' || key === 'supplier' ? cellText(r.tree, key).toLowerCase() : num(r.tree[key])),
      csv: (r) => cellText(r.tree, key),
    });
    return [
      { key: 'block', group: 'tree', label: t('common.block'), sort: (r) => r.tree.block, csv: (r) => r.tree.block, cell: (r) => r.tree.block },
      { key: 'variant', group: 'tree', label: t('common.variant'), sort: (r) => r.tree.variant, csv: (r) => r.tree.variant, cell: (r) => r.tree.variant },
      {
        key: 'planted',
        group: 'tree',
        label: t('kebun.col.planted'),
        sort: (r) => plantedDateStr(r.tree.datePlanted),
        csv: (r) => plantedDateStr(r.tree.datePlanted),
        cell: (r) => plantedDateStr(r.tree.datePlanted).slice(0, 4),
      },
      field('supplier', 'tree', t('trees.col.supplier'), false),
      field('canopySize', 'size', t('kebun.col.tajuk'), true, t('field.canopy')),
      field('trunkSize', 'size', t('kebun.col.batang'), true, t('field.trunk')),
      field('floweringBranches', 'crop', t('kebun.col.dahan'), true, t('field.branches')),
      field('floweringClusters', 'crop', t('kebun.col.est'), true, t('kebun.col.est.title')),
      field('estimatedFruitCount', 'crop', t('kebun.col.buah'), true, t('field.fruits')),
      ...dates.map(
        (d): Col => ({
          key: `count:${d}`,
          group: 'counts',
          label: formatShortDate(d),
          right: true,
          sort: (r) => r.counts?.get(d)?.count,
          csv: (r) => r.counts?.get(d)?.count,
          cell: (r) => {
            const c = r.counts?.get(d);
            return c ? <span title={t(`crop.stage.${c.stage}`)}>{c.count}</span> : null;
          },
        })
      ),
      {
        key: 'stage',
        group: 'stage',
        label: t('stage.col'),
        sort: (r) => {
          const s = observedNow(r.tree);
          return s && !s.stale ? FARM_STAGES.indexOf(s.code) : 99;
        },
        csv: stageText,
        cell: (r) => <TreeStageCell tree={r.tree} crop={r.crop} compact />,
      },
      {
        key: 'health',
        group: 'health',
        label: t('kebun.col.health'),
        sort: (r) => (r.health ? HEALTH.indexOf(r.health) : 9),
        csv: (r) => (r.health ? `${HEALTH_INFO[r.health].label[lang]}${improvingNow(r.tree) ? ` (${t('cond.improving')})` : ''}` : ''),
        cell: (r) => (
          <span title={r.tree.conditionNotes || undefined}>
            {r.health ? <HealthPill health={r.health} improving={improvingNow(r.tree)} /> : <span className="text-xs text-slate-400">{t('cond.not_assessed')}</span>}
          </span>
        ),
      },
      ...(['batang', 'tajuk', 'est', 'fruitset'] as const).map(
        (k): Col => ({
          key: `label:${k}`,
          group: 'label',
          label: t(`kebun.lab.${k}`),
          title: rules.confirmed ? t('kebun.labels.titleOk') : t('kebun.labels.title'),
          sort: (r) => (r.labels[k] ? ['skip', 'low', 'mid', 'high'].indexOf(r.labels[k]!) : -1),
          csv: (r) => r.labels[k] || '',
          cell: (r) => labelChip(r.labels[k]),
        })
      ),
      {
        key: 'dose',
        group: 'dose',
        label: rules.confirmed ? t('kebun.col.doseOk') : t('kebun.col.dose'),
        title: rules.confirmed ? t('kebun.dose.titleOk') : t('kebun.dose.title'),
        right: true,
        sort: (r) => r.dose?.dose,
        csv: (r) => (r.dose ? `${r.dose.dose}${rules.dose.unit ? ` ${rules.dose.unit}` : ''} ${r.dose.product}` : ''),
        cell: (r) =>
          r.dose ? (
            <span className="whitespace-nowrap">
              <strong className="tabular">{r.dose.dose}</strong>
              {rules.dose.unit ? ` ${rules.dose.unit}` : ''} <span className="text-xs text-slate-500">{r.dose.product}</span>
            </span>
          ) : null,
      },
      field('notes', 'notes', t('common.notes'), false),
    ];
  }, [t, lang, dates, rules]);

  const shownCols = cols.filter((c) => !hidden.has(c.group));
  const editCols = shownCols.map((c, i) => (c.edit ? i : -1)).filter((i) => i >= 0);

  const filtered = useMemo(() => {
    let list = rows.filter((r) => {
      if (block && r.tree.block !== block) return false;
      if (q && !r.tree.id.toUpperCase().includes(q)) return false;
      if (health && (r.health || 'none') !== health) return false;
      if (stage) {
        const s = observedNow(r.tree);
        const code = s && !s.stale ? s.code : 'unseen';
        if (code !== stage) return false;
      }
      return true;
    });
    const col = cols.find((c) => c.key === sortKey);
    if (sortKey === 'id') {
      list = [...list].sort((a, b) => {
        const d = a.tree.id.localeCompare(b.tree.id, undefined, { numeric: true });
        return desc ? -d : d;
      });
    } else if (col?.sort) {
      const val = col.sort;
      list = [...list].sort((a, b) => {
        const x = val(a);
        const y = val(b);
        if (x === undefined && y === undefined) return idOrder(a.tree, b.tree);
        if (x === undefined) return 1;
        if (y === undefined) return -1;
        const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        return (desc ? -d : d) || idOrder(a.tree, b.tree);
      });
    }
    return list;
  }, [rows, cols, block, q, health, stage, sortKey, desc]);

  const blocks = useMemo(() => Array.from(new Set(trees.map((x) => x.block).filter(Boolean))).sort(), [trees]);
  const sum = (f: (r: Row) => number | undefined) => filtered.reduce((acc, r) => acc + (f(r) || 0), 0);

  const focusCell = (ri: number, ci: number) =>
    requestAnimationFrame(() => (document.querySelector(`[data-cell="${ri}:${ci}"]`) as HTMLElement | null)?.focus());

  /** The next editable cell from (ri, ci) in a direction; stays put at the edges. */
  const step = (ri: number, ci: number, dir: 'up' | 'down' | 'left' | 'right'): [number, number] => {
    if (dir === 'up') return [Math.max(0, ri - 1), ci];
    if (dir === 'down') return [Math.min(filtered.length - 1, ri + 1), ci];
    const k = editCols.indexOf(ci);
    if (dir === 'right') return k < editCols.length - 1 ? [ri, editCols[k + 1]] : ri < filtered.length - 1 ? [ri + 1, editCols[0]] : [ri, ci];
    return k > 0 ? [ri, editCols[k - 1]] : ri > 0 ? [ri - 1, editCols[editCols.length - 1]] : [ri, ci];
  };

  const commit = async (then?: [number, number]) => {
    if (!editing || committed.current === editing) return;
    const { treeId, field, text } = editing;
    const row = filtered.find((r) => r.tree.id === treeId);
    if (!row) return setEditing(null);
    const c = checkCell(field, text);
    if (!c.ok) {
      setCellError({ treeId, field, msg: t(c.error.key, c.error.vars) });
      return;
    }
    committed.current = editing;
    setCellError(null);
    setEditing(null);
    if (then) focusCell(...then);
    if (sameValue(row.tree, field, c.value)) return;
    setSaving(`${treeId}:${field}`);
    const ok = await updateTree(row.tree, treeDraft(row.tree, { [field]: c.value }));
    setSaving(null);
    if (!ok) setCellError({ treeId, field, msg: t('kebun.saveError') });
  };

  const exportCsv = () => {
    const head = ['ID', ...shownCols.map((c) => c.label)];
    const body = filtered.map((r) => [r.tree.id, ...shownCols.map((c) => c.csv(r))]);
    const blob = new Blob(['﻿' + toCsv([head, ...body])], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kebun_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const sortBy = (key: string) => setParams({ sort: sortKey === key && desc ? null : key, dir: sortKey === key && !desc ? 'desc' : null });
  const th = 'px-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-200 whitespace-nowrap border-b border-slate-700 bg-slate-900';
  const groupSpans = GROUPS.filter((g) => !hidden.has(g))
    .map((g) => ({ g, n: shownCols.filter((c) => c.group === g).length }))
    .filter((x) => x.n > 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('kebun.title')}
        description={t('kebun.desc', { n: trees.length })}
        actions={
          <>
            <button type="button" onClick={() => setPasting(true)} className={btnSecondary} aria-label={t('kebun.paste')}>
              <ClipboardPaste className="w-4 h-4" />
              <span className="hidden sm:inline">{t('kebun.paste')}</span>
            </button>
            <button type="button" onClick={exportCsv} className={btnSecondary} aria-label={t('kebun.csv')}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </>
        }
      />

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
        <div className="grid grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto] gap-2">
          <div className="relative col-span-2 lg:col-span-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={params.get('q') || ''}
              onChange={(e) => setParams({ q: e.target.value || null })}
              placeholder={t('kebun.search')}
              aria-label={t('kebun.search')}
              className={`${inputCls} pl-9`}
            />
          </div>
          <select value={block} onChange={(e) => setParams({ block: e.target.value || null })} aria-label={t('common.block')} className={inputCls}>
            <option value="">{t('common.allBlocks')}</option>
            {blocks.map((b) => (
              <option key={b} value={b}>{t('common.blockN', { n: b })}</option>
            ))}
          </select>
          <select value={stage} onChange={(e) => setParams({ stage: e.target.value || null })} aria-label={t('stage.col')} className={inputCls}>
            <option value="">{t('kebun.allStages')}</option>
            {FARM_STAGES.map((s) => (
              <option key={s} value={s}>{FARM_STAGE_INFO[s].label[lang]}</option>
            ))}
            <option value="unseen">{t('stage.unseen')}</option>
          </select>
          <select value={health} onChange={(e) => setParams({ health: e.target.value || null })} aria-label={t('kebun.col.health')} className={inputCls}>
            <option value="">{t('common.allConditions')}</option>
            {HEALTH.map((h) => (
              <option key={h} value={h}>{HEALTH_INFO[h].label[lang]}</option>
            ))}
            <option value="none">{t('cond.not_assessed')}</option>
          </select>
          <button type="button" onClick={() => setShowCols((v) => !v)} aria-expanded={showCols} className={`${btnSecondary} !min-h-11`}>
            <Columns3 className="w-4 h-4" />
            {t('kebun.columns')}
          </button>
        </div>
        {showCols && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('kebun.columns')}>
            {GROUPS.filter((g) => g !== 'tree').map((g) => {
              const on = !hidden.has(g);
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(g);
                      else next.delete(g);
                      return next;
                    })
                  }
                  className={`min-h-9 px-3 rounded-full border text-sm font-semibold ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'}`}
                >
                  {t(`kebun.g.${g}`)}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs text-slate-600">
          {t('kebun.howto')} <span className="text-slate-500">{t('kebun.shown', { n: filtered.length })}</span>
        </p>
      </div>

      {cellError && (
        <p role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
          <strong>{cellError.treeId}</strong> · {cols.find((c) => c.edit === cellError.field)?.label}: {cellError.msg}
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-auto max-h-[calc(100vh-240px)] min-h-[320px]">
        <table className="text-sm border-separate border-spacing-0 min-w-full">
          <thead>
            <tr className="h-7">
              <th
                rowSpan={2}
                scope="col"
                aria-sort={sortKey === 'id' ? (desc ? 'descending' : 'ascending') : undefined}
                className={`${th} sticky left-0 top-0 z-30 min-w-[64px] border-r`}
              >
                <button type="button" onClick={() => sortBy('id')} className={`inline-flex items-center gap-1 ${sortKey === 'id' ? 'text-white' : ''}`}>
                  ID
                  {sortKey === 'id' && (desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                </button>
              </th>
              {groupSpans.map(({ g, n }) => (
                <th key={g} colSpan={n} scope="colgroup" className={`${th} sticky top-0 z-20 h-7 text-slate-400 border-l border-slate-700`}>
                  {t(`kebun.g.${g}`)}
                </th>
              ))}
            </tr>
            <tr>
              {shownCols.map((c, i) => {
                const first = i === 0 || shownCols[i - 1].group !== c.group;
                const active = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    title={c.title}
                    aria-sort={active ? (desc ? 'descending' : 'ascending') : undefined}
                    className={`${th} sticky top-7 z-20 h-9 ${c.right ? 'text-right' : ''} ${first ? 'border-l border-slate-700' : ''}`}
                  >
                    <button type="button" onClick={() => c.sort && sortBy(c.key)} className={`inline-flex items-center gap-1 ${c.right ? 'flex-row-reverse' : ''} ${active ? 'text-white' : ''}`}>
                      {c.label}
                      {active && (desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, ri) => (
              <tr key={r.tree.id} className="group">
                <th scope="row" className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-2.5 py-1.5 text-left border-b border-r border-slate-200 whitespace-nowrap">
                  <Link to={treeUrl(r.tree.id)} className="font-mono font-bold text-emerald-800 hover:underline">
                    {r.tree.id}
                  </Link>
                </th>
                {shownCols.map((c, ci) => {
                  const first = ci === 0 || shownCols[ci - 1].group !== c.group;
                  // Sheet grid: a light line on every cell, a darker one where a column group starts.
                  const base = `border-b border-r border-slate-200 group-hover:bg-slate-50 ${first ? 'border-l border-l-slate-300' : ''} ${c.right ? 'text-right' : ''}`;
                  if (!c.edit) {
                    return (
                      <td key={c.key} className={`${base} px-2.5 py-1.5 whitespace-nowrap ${c.right ? 'tabular' : ''}`}>
                        {c.cell!(r)}
                      </td>
                    );
                  }
                  const f = c.edit;
                  const isEditing = editing?.treeId === r.tree.id && editing.field === f;
                  const bad = cellError?.treeId === r.tree.id && cellError.field === f;
                  const busy = saving === `${r.tree.id}:${f}`;
                  const text = cellText(r.tree, f);
                  const wide = f === 'notes' || f === 'supplier';
                  return (
                    <td key={c.key} className={`${base} p-0 ${wide ? 'min-w-[200px]' : 'min-w-[64px]'}`}>
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editing.text}
                          onFocus={(e) => {
                            const el = e.currentTarget;
                            if (editing.typed) el.setSelectionRange(el.value.length, el.value.length);
                            else el.select();
                          }}
                          onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                          onBlur={() => commit()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commit(step(ri, ci, e.shiftKey ? 'up' : 'down'));
                            } else if (e.key === 'Tab') {
                              e.preventDefault();
                              commit(step(ri, ci, e.shiftKey ? 'left' : 'right'));
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditing(null);
                              setCellError(null);
                              focusCell(ri, ci);
                            }
                          }}
                          inputMode={wide ? 'text' : 'decimal'}
                          aria-label={`${r.tree.id} · ${c.label}`}
                          aria-invalid={bad || undefined}
                          className={`w-full h-9 px-2.5 bg-white text-sm outline-2 -outline-offset-2 ${bad ? 'outline-rose-500' : 'outline-emerald-500'} ${c.right ? 'text-right tabular' : ''}`}
                        />
                      ) : (
                        <button
                          type="button"
                          data-cell={`${ri}:${ci}`}
                          onClick={() => setEditing({ treeId: r.tree.id, field: f, text })}
                          onKeyDown={(e) => {
                            const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key] as 'up' | 'down' | 'left' | 'right' | undefined;
                            if (dir) {
                              e.preventDefault();
                              focusCell(...step(ri, ci, dir));
                            } else if (e.key === 'Enter' || e.key === 'F2') {
                              e.preventDefault();
                              setEditing({ treeId: r.tree.id, field: f, text });
                            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                              e.preventDefault();
                              setEditing({ treeId: r.tree.id, field: f, text: '', typed: true });
                            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                              e.preventDefault();
                              setEditing({ treeId: r.tree.id, field: f, text: e.key, typed: true });
                            }
                          }}
                          aria-label={`${r.tree.id} · ${c.label}: ${text || '—'}`}
                          className={`w-full h-9 px-2.5 ${c.right ? 'text-right tabular' : 'text-left'} hover:bg-emerald-50 focus:outline-2 focus:-outline-offset-2 focus:outline-emerald-600 ${
                            busy ? 'text-slate-400' : bad ? 'text-rose-700' : 'text-slate-900'
                          } ${wide ? 'truncate max-w-[280px]' : ''}`}
                          title={wide && text ? text : undefined}
                        >
                          {text || '\u00A0'}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="font-semibold text-slate-700 bg-slate-50">
                <th scope="row" className="sticky left-0 bottom-0 z-10 bg-slate-100 px-2.5 py-2 text-left border-t border-r border-slate-200 whitespace-nowrap text-xs">
                  {t('kebun.total')}
                </th>
                {shownCols.map((c) => {
                  const sumOf =
                    c.key === 'floweringBranches' || c.key === 'floweringClusters' || c.key === 'estimatedFruitCount'
                      ? sum((r) => num(r.tree[c.key as EditField]))
                      : c.key.startsWith('count:')
                        ? sum((r) => r.counts?.get(c.key.slice(6))?.count)
                        : null;
                  if (c.key === 'dose') {
                    // One total per product: different fertilisers are never added together.
                    const byProduct = new Map<string, number>();
                    for (const r of filtered) if (r.dose) byProduct.set(r.dose.product, (byProduct.get(r.dose.product) || 0) + r.dose.dose);
                    return (
                      <td key={c.key} className="sticky bottom-0 bg-slate-100 px-2.5 py-2 border-t border-slate-200 text-right tabular whitespace-nowrap">
                        {[...byProduct].map(([product, total]) => (
                          <span key={product} className="block">
                            {Math.round(total * 100) / 100}
                            {rules.dose.unit ? ` ${rules.dose.unit}` : ''} <span className="text-xs font-normal text-slate-500">{product}</span>
                          </span>
                        ))}
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} className="sticky bottom-0 bg-slate-100 px-2.5 py-2 border-t border-slate-200 text-right tabular whitespace-nowrap">
                      {sumOf === null ? '' : Math.round(sumOf * 100) / 100}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
        {filtered.length === 0 && <p className="p-8 text-center text-sm text-slate-600">{t('kebun.empty')}</p>}
      </div>

      <LabelRulesPanel stored={stored} samples={samples} />

      {pasting && <KebunPasteSheet onClose={() => setPasting(false)} />}
    </div>
  );
};
