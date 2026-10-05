import type { DurianTree } from '../types';
import type { CropCount, CropStage } from './fieldData';
import { TREE_LIMITS } from './trees';
import { diffDays, todayStr } from './treatments';

/**
 * Kebun: the farm as one sheet, one row per tree, like the owner's Google Sheet. Pure helpers for typing into
 * cells, pasting from Google Sheets (preview of the changed cells only) and CSV export. Writes go through the
 * same tree save as the tree form, so every change is logged in `treeEdits`.
 */

/** Columns that can be typed into or pasted. */
export const EDIT_FIELDS = ['canopySize', 'trunkSize', 'floweringBranches', 'floweringClusters', 'estimatedFruitCount', 'supplier', 'notes'] as const;
export type EditField = (typeof EDIT_FIELDS)[number];
type NumberField = Exclude<EditField, 'notes' | 'supplier'>;

const LIMITS: Record<NumberField, { min: number; max: number; integer: boolean }> = {
  ...TREE_LIMITS,
  floweringBranches: { min: 0, max: 500, integer: true },
};
export const isNumberField = (f: EditField): f is NumberField => f !== 'notes' && f !== 'supplier';
const TEXT_MAX = 2000;

export type CellError = { key: string; vars?: Record<string, string | number> };
export type CellCheck = { ok: true; value: number | string | null } | { ok: false; error: CellError };

/** A typed or pasted value, checked like the tree form. Empty clears the cell. */
export function checkCell(field: EditField, raw: string): CellCheck {
  const s = raw.trim();
  if (!s) return { ok: true, value: null };
  if (!isNumberField(field)) return { ok: true, value: s.slice(0, TEXT_MAX) };
  const n = Number(s.replace(',', '.'));
  const lim = LIMITS[field];
  if (!Number.isFinite(n)) return { ok: false, error: { key: 'tree.v.number' } };
  if (lim.integer && !Number.isInteger(n)) return { ok: false, error: { key: 'tree.v.whole' } };
  if (n < lim.min || n > lim.max) return { ok: false, error: { key: 'tree.v.range', vars: { min: lim.min, max: lim.max } } };
  return { ok: true, value: n };
}

/** A cell's current value as text (canopy may be stored as a number or as text). */
export function cellText(tree: DurianTree, f: EditField): string {
  const v = tree[f];
  return v === undefined || v === null ? '' : String(v).trim();
}

/** Same value? Numbers compare as numbers ("500" = 500), text as trimmed text. */
export function sameValue(tree: DurianTree, f: EditField, value: number | string | null): boolean {
  const cur = cellText(tree, f);
  if (value === null) return cur === '';
  if (typeof value === 'number') return cur !== '' && Number(cur.replace(',', '.')) === value;
  return cur === value.trim();
}

/**
 * The draft the tree save expects: it compares every field, so it gets the whole tree plus the change. The planting
 * date is left out (the save only touches it when the draft names it).
 */
export function treeDraft(tree: DurianTree, patch: Partial<Record<EditField, number | string | null>>): Partial<DurianTree> {
  const { datePlanted: _date, ...rest } = tree;
  const draft: Record<string, unknown> = { ...rest };
  for (const [k, v] of Object.entries(patch)) draft[k] = v === null ? (k === 'notes' || k === 'supplier' ? '' : null) : v;
  return draft as Partial<DurianTree>;
}

// ---------- paste from Google Sheets ----------

export type PasteField = EditField | 'id' | 'perBranch';

/** Header words in the owner's sheet (and English), lower case, letters only. */
const ALIASES: Array<[PasteField, string[]]> = [
  ['id', ['id', 'pohon', 'tree', 'kode', 'nopohon', 'treeid']],
  ['canopySize', ['tajuk', 'canopy', 'kanopi', 'lebarkanopi', 'lebartajuk']],
  ['trunkSize', ['batang', 'trunk', 'lingkar', 'lingkarbatang', 'girth']],
  ['floweringBranches', ['dahan', 'dahanberbunga', 'branches', 'floweringbranches', 'cabang', 'cabangberbunga']],
  ['perBranch', ['bonggol', 'bonggolperdahan', 'perbranch', 'clustersperbranch']],
  ['floweringClusters', ['estbutir', 'est', 'butir', 'tandan', 'tandanbunga', 'clusters', 'flowerclusters']],
  ['estimatedFruitCount', ['buah', 'fruit', 'fruitset', 'jumlahbuah', 'fruits', 'estfruit']],
  ['supplier', ['supplier', 'pemasok', 'asalbibit']],
  ['notes', ['catatan', 'notes', 'note', 'keterangan', 'ket']],
];
const ALIAS = new Map(ALIASES.flatMap(([f, words]) => words.map((w) => [w, f] as const)));

export function headerField(h: string): PasteField | null {
  return ALIAS.get(h.toLowerCase().replace(/[^a-z]/g, '')) ?? null;
}

export interface PasteTable {
  headers: string[];
  fields: Array<PasteField | null>;
  rows: string[][];
}

/** Rows copied from a sheet: tab-separated (Google Sheets), else semicolon or comma. First row = headers. */
export function parsePaste(text: string): PasteTable | { error: 'empty' | 'noId' } {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return { error: 'empty' };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  const headers = split(lines[0]);
  const fields = headers.map(headerField);
  // First column wins if a header appears twice.
  const seen = new Set<PasteField>();
  fields.forEach((f, i) => {
    if (f && seen.has(f)) fields[i] = null;
    else if (f) seen.add(f);
  });
  if (!fields.includes('id')) return { error: 'noId' };
  return { headers, fields, rows: lines.slice(1).map(split) };
}

export interface CellChange {
  treeId: string;
  field: EditField;
  from: string;
  to: number | string | null;
}
export interface PasteDiff {
  changes: CellChange[];
  errors: Array<{ treeId: string; field: EditField; raw: string; error: CellError }>;
  /** Tree ids in the paste that aren't on the farm (or are archived). */
  unknown: string[];
  /** Headers that don't match a column. */
  ignored: string[];
  /** Cells that already hold the pasted value. */
  same: number;
}

/**
 * What a paste would change. Empty cells are skipped (they never clear a value). "Bonggol" (clusters per branch)
 * with "Dahan" gives the clusters when the paste has no clusters column.
 */
export function pasteDiff(table: PasteTable, trees: DurianTree[]): PasteDiff {
  const byId = new Map(trees.map((t) => [t.id.toUpperCase(), t]));
  const out: PasteDiff = { changes: [], errors: [], unknown: [], ignored: [], same: 0 };
  table.headers.forEach((h, i) => {
    if (!table.fields[i] && h) out.ignored.push(h);
  });
  const idCol = table.fields.indexOf('id');
  const col = (f: PasteField) => table.fields.indexOf(f);
  const derive = col('floweringClusters') < 0 && col('floweringBranches') >= 0 && col('perBranch') >= 0;
  for (const row of table.rows) {
    const id = (row[idCol] || '').toUpperCase().replace(/\s+/g, '');
    if (!id) continue;
    const tree = byId.get(id);
    if (!tree) {
      if (!out.unknown.includes(id)) out.unknown.push(id);
      continue;
    }
    const cells: Array<[EditField, string]> = [];
    table.fields.forEach((f, i) => {
      if (f && f !== 'id' && f !== 'perBranch') cells.push([f, row[i] ?? '']);
    });
    if (derive) {
      const b = Number((row[col('floweringBranches')] || '').replace(',', '.'));
      const p = Number((row[col('perBranch')] || '').replace(',', '.'));
      if ((row[col('perBranch')] || '').trim() && Number.isFinite(b) && Number.isFinite(p)) cells.push(['floweringClusters', String(b * p)]);
    }
    for (const [field, raw] of cells) {
      if (!raw.trim()) continue;
      const c = checkCell(field, raw);
      if (!c.ok) out.errors.push({ treeId: tree.id, field, raw, error: c.error });
      else if (sameValue(tree, field, c.value)) out.same++;
      else out.changes.push({ treeId: tree.id, field, from: cellText(tree, field), to: c.value });
    }
  }
  return out;
}

/** The changes per tree, ready for one save (and one log entry) each. */
export function changesByTree(changes: CellChange[]): Map<string, Partial<Record<EditField, number | string | null>>> {
  const m = new Map<string, Partial<Record<EditField, number | string | null>>>();
  for (const c of changes) m.set(c.treeId, { ...(m.get(c.treeId) || {}), [c.field]: c.to });
  return m;
}

// ---------- CSV ----------

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? '' : String(v);
          return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\n');
}

// ---------- dated counts, as in the sheet (2 Sep, 16 Sep, 28 Sep) ----------

/** Which count to show when a tree was counted twice on one day: fruit before flowers. */
const STAGE_RANK: Record<CropStage, number> = { clusters: 0, set: 1, kept: 2, onTree: 3 };

/** The latest days anything was counted (oldest first), at most `n`, within `days`. */
export function countDates(counts: CropCount[], n = 4, days = 150, today = todayStr()): string[] {
  const dates = Array.from(new Set(counts.filter((c) => c.date <= today && diffDays(today, c.date) <= days).map((c) => c.date))).sort();
  return dates.slice(-n);
}

/** Tree id -> date -> the count to show that day. */
export function countGrid(counts: CropCount[]): Map<string, Map<string, { count: number; stage: CropStage }>> {
  const out = new Map<string, Map<string, { count: number; stage: CropStage }>>();
  for (const c of counts) {
    const row = out.get(c.treeId) || new Map<string, { count: number; stage: CropStage }>();
    const cur = row.get(c.date);
    if (!cur || STAGE_RANK[c.stage] > STAGE_RANK[cur.stage]) row.set(c.date, { count: c.count, stage: c.stage });
    out.set(c.treeId, row);
  }
  return out;
}
