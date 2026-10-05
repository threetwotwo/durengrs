import { useMemo, useSyncExternalStore } from 'react';
import { common } from './common';
import { shell } from './shell';
import { dashboard } from './dashboard';
import { schedule } from './schedule';
import { trees } from './trees';
import { reports } from './reports';
import { variants } from './variants';
import { guide } from './guide';
import { records } from './records';
import { harvest } from './harvest';
import { kebun } from './kebun';

/**
 * Tiny i18n layer. Indonesian is the default (the owner and the WhatsApp Flow speak Indonesian);
 * English is a toggle in the header. Wording follows the WhatsApp Flow (see common.ts glossary).
 *
 *   const { t, lang } = useT();
 *   t('dash.greeting.morning')
 *   t('trees.count', { n: 12 })       // "{n} pohon"
 *
 * Non-React code (lib/*.ts) can call translate(key, vars). Components must call useT() somewhere so
 * they re-render when the language changes.
 */

export type Lang = 'id' | 'en';
export type Dict = Record<string, string>;
export interface Bundle {
  id: Dict;
  en: Dict;
}

const bundles: Bundle[] = [common, shell, dashboard, schedule, trees, reports, variants, guide, records, harvest, kebun];
const merged: Bundle = { id: {}, en: {} };
for (const b of bundles) {
  Object.assign(merged.id, b.id);
  Object.assign(merged.en, b.en);
}

const STORAGE_KEY = 'cilowong.lang';
const listeners = new Set<() => void>();

function readInitial(): Lang {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'id' || v === 'en') return v;
  } catch {
    /* storage can be unavailable (private mode) */
  }
  return 'id';
}

let current: Lang = typeof window === 'undefined' ? 'id' : readInitial();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export function getLang(): Lang {
  return current;
}

export function setLang(next: Lang) {
  if (next === current) return;
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = next;
  listeners.forEach((l) => l());
}

export type Vars = Record<string, string | number>;

export function translate(key: string, vars?: Vars, lang: Lang = current): string {
  let s = merged[lang][key] ?? merged.en[key] ?? merged.id[key];
  if (s === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** BCP-47 locale for Intl / toLocaleDateString. */
export function locale(lang: Lang = current): string {
  return lang === 'id' ? 'id-ID' : 'en-GB';
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useT() {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  // Same object (and same `t`) until the language changes, so `t` can sit in hook dependencies without re-running
  // them on every render.
  return useMemo(
    () => ({
      lang,
      setLang,
      locale: locale(lang),
      t: (key: string, vars?: Vars) => translate(key, vars, lang),
    }),
    [lang]
  );
}
