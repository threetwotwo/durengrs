import { DurianTree, DurianVariant } from '../types';
import { ripeningRefFor } from './guide';

/**
 * Validation for the Variants form, shared with the Guide's farm check.
 *
 * Codes are Firestore document IDs (variants/{code}) and are stored on every tree, so they must be short,
 * unique and free of "/" (which would break the path). Ripening days drive the harvest outlook and the Guide's
 * season stages, so they must be a whole number in a plausible range; the published range is 90-150 days.
 */

export const CODE_RE = /^[A-Z0-9][A-Z0-9-]{0,9}$/;
export const RIPENING_MIN = 60;
export const RIPENING_MAX = 200;

export const normalizeCode = (raw: string) => raw.trim().toUpperCase();

export interface VariantInput {
  code: string;
  name: string;
  ripeningDays: string;
}

/** i18n keys: errors block saving, warnings only inform. */
export interface VariantValidation {
  errors: Partial<Record<'code' | 'name' | 'ripeningDays', string>>;
  warnings: Partial<Record<'name' | 'ripeningDays', { key: string; vars?: Record<string, string | number> }>>;
}

export function validateVariant(
  input: VariantInput,
  existing: DurianVariant[],
  mode: 'create' | 'edit'
): VariantValidation {
  const errors: VariantValidation['errors'] = {};
  const warnings: VariantValidation['warnings'] = {};
  const code = mode === 'create' ? normalizeCode(input.code) : input.code;
  const name = input.name.trim();

  // An existing code is the document ID and can't be changed, so only new codes are checked.
  if (mode === 'create') {
    if (!code) errors.code = 'var.v.code.required';
    else if (!CODE_RE.test(code)) errors.code = 'var.v.code.format';
    else if (existing.some((v) => v.code === code)) errors.code = 'var.v.code.taken';
  }

  if (!name) errors.name = 'var.v.name.required';
  else if (name.length > 60) errors.name = 'var.v.name.long';
  else {
    const twin = existing.find((v) => v.code !== code && !v.nameMissing && v.name.trim().toLowerCase() === name.toLowerCase());
    if (twin) warnings.name = { key: 'var.v.name.duplicate', vars: { code: twin.code } };
  }

  const raw = input.ripeningDays.trim();
  if (raw) {
    const n = Number(raw);
    if (!Number.isInteger(n)) errors.ripeningDays = 'var.v.ripening.whole';
    else if (n < RIPENING_MIN || n > RIPENING_MAX) errors.ripeningDays = 'var.v.ripening.range';
    else {
      const ref = ripeningRefFor({ code, name } as DurianVariant);
      if (ref && (n < ref.min - 5 || n > ref.max + 5)) {
        warnings.ripeningDays = { key: 'var.v.ripening.outsideRef', vars: { min: ref.min, max: ref.max } };
      }
    }
  }
  return { errors, warnings };
}

/** Variant codes that trees use but that have no variants/{code} document, with tree counts. */
export function unknownVariantCodes(trees: DurianTree[], variants: DurianVariant[]): Array<{ code: string; trees: number }> {
  const known = new Set(variants.map((v) => v.code));
  const counts = new Map<string, number>();
  for (const t of trees) {
    if (!t.variant || known.has(t.variant)) continue;
    counts.set(t.variant, (counts.get(t.variant) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([code, n]) => ({ code, trees: n }))
    .sort((a, b) => b.trees - a.trees || a.code.localeCompare(b.code));
}

/** True when the farm's ripening days are more than 5 days outside the published range for this variety. */
export function ripeningOutsideRef(v: DurianVariant): { min: number; max: number } | null {
  const days = Number(v.ripeningDays);
  const ref = ripeningRefFor(v);
  if (!ref || !(days > 0)) return null;
  return days < ref.min - 5 || days > ref.max + 5 ? { min: ref.min, max: ref.max } : null;
}
