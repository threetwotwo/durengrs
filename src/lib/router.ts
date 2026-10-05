import { useCallback, useSyncExternalStore } from 'react';

/**
 * Tiny hash router. The URL is the single source of truth for where you are:
 *
 *   #/                      dashboard
 *   #/kebun                 the farm as one sheet (one row per tree), editable like Google Sheets
 *   #/harvest               crop tracking per tree, graded harvests, forecast
 *   #/schedule
 *   #/trees?block=A&condition=emergency&q=A1&stale=1&page=2
 *   #/trees/A12             tree detail
 *   #/variants
 *   #/reports?block=A&condition=minor&changed=1&q=...
 *   #/reports/abc123        one report
 *   #/guide                 research guide
 *   #/guide/phytophthora    one guide topic
 *
 * Hash routing needs no server rewrites (works on AI Studio, Firebase Hosting, any static host),
 * gives working Back/Forward, shareable deep links, and survives reloads.
 */

export type AppTab = 'dashboard' | 'kebun' | 'harvest' | 'schedule' | 'trees' | 'variants' | 'reports' | 'guide';

export interface Route {
  tab: AppTab;
  treeId: string | null;
  /** Guide topic, e.g. "phytophthora" in #/guide/phytophthora. Validated by the Guide page. */
  topicId: string | null;
  /** Report document id in #/reports/abc123. */
  reportId: string | null;
  params: URLSearchParams;
  /** Path without query, e.g. "/trees/A12". */
  path: string;
  /** Changes only when the "page" changes (not when filters change). Used for scroll reset. */
  pageKey: string;
  /** False when the hash did not match any known page. */
  known: boolean;
}

const TABS: AppTab[] = ['dashboard', 'kebun', 'harvest', 'schedule', 'trees', 'variants', 'reports', 'guide'];

function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = ('/' + pathPart.replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(queryPart);
  const segs = path.split('/').filter(Boolean);

  let tab: AppTab = 'dashboard';
  let treeId: string | null = null;
  let topicId: string | null = null;
  let reportId: string | null = null;
  let known = true;

  if (segs.length === 0) {
    tab = 'dashboard';
  } else if (TABS.includes(segs[0] as AppTab) && segs[0] !== 'dashboard') {
    tab = segs[0] as AppTab;
    if (tab === 'trees' && segs.length === 2) treeId = decodeURIComponent(segs[1]);
    else if (tab === 'guide' && segs.length === 2) topicId = decodeURIComponent(segs[1]);
    else if (tab === 'reports' && segs.length === 2) reportId = decodeURIComponent(segs[1]);
    else if (segs.length > 1) known = false;
  } else {
    known = false;
  }
  return { tab, treeId, topicId, reportId, params, path, pageKey: `${tab}:${treeId ?? topicId ?? reportId ?? ''}`, known };
}

// ---- store ----

let currentHash = typeof window === 'undefined' ? '' : window.location.hash;
let cached: { hash: string; route: Route } = { hash: currentHash, route: parseHash(currentHash) };
const listeners = new Set<() => void>();
let blocker: (() => boolean) | null = null;
let skipBlockOnce = false;

function emit() {
  currentHash = window.location.hash;
  listeners.forEach((l) => l());
}

function getRoute(): Route {
  const h = window.location.hash;
  if (cached.hash !== h) cached = { hash: h, route: parseHash(h) };
  return cached.route;
}

function onUrlChange() {
  const next = window.location.hash;
  if (next === currentHash) return; // popstate and hashchange both fire for one change
  if (skipBlockOnce) {
    skipBlockOnce = false;
    emit();
    return;
  }
  // Back/Forward/typed URL while a guard is active (e.g. unsaved changes).
  if (blocker && !blocker()) {
    window.history.pushState(window.history.state, '', currentHash || '#/');
    emit();
    return;
  }
  emit();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', onUrlChange);
  window.addEventListener('hashchange', onUrlChange);
  // Number each in-app history entry so we know whether Back stays inside the app.
  if (!window.history.state || typeof window.history.state.i !== 'number') {
    window.history.replaceState({ i: 0 }, '');
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ---- public API ----

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getRoute, getRoute);
}

/** Register a guard. Return false from `fn` to cancel the navigation. Pass null to clear. */
export function setNavigationBlocker(fn: (() => boolean) | null) {
  blocker = fn;
}

export function navigate(to: string, opts: { replace?: boolean } = {}): boolean {
  const target = '#' + (to.startsWith('/') ? to : '/' + to);
  if (target === window.location.hash || (target === '#/' && !window.location.hash)) return true;
  if (blocker && !blocker()) return false;

  const idx = typeof window.history.state?.i === 'number' ? window.history.state.i : 0;
  if (opts.replace) {
    window.history.replaceState({ i: idx }, '', target);
  } else {
    window.history.pushState({ i: idx + 1 }, '', target);
  }
  emit();
  return true;
}

/** True when the previous history entry is inside this app. */
export function canGoBack(): boolean {
  return (window.history.state?.i ?? 0) > 0;
}

/** Back if there is in-app history, otherwise go to `fallback`. */
export function goBack(fallback: string) {
  if (canGoBack()) {
    if (blocker && !blocker()) return;
    skipBlockOnce = true; // we already asked above
    window.history.back();
  } else {
    navigate(fallback, { replace: true });
  }
}

/** Read and update the query string of the current page. Filters use replace so Back is not spammed. */
export function useQueryParams(): [URLSearchParams, (patch: Record<string, string | null | undefined>, opts?: { replace?: boolean }) => void] {
  const route = useRoute();
  const setParams = useCallback(
    (patch: Record<string, string | null | undefined>, opts: { replace?: boolean } = { replace: true }) => {
      const r = getRoute();
      const next = new URLSearchParams(r.params);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '' || v === 'all') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      navigate(r.path + (qs ? `?${qs}` : ''), { replace: opts.replace !== false });
    },
    []
  );
  return [route.params, setParams];
}

export function treesUrl(filters: Record<string, string | null | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v && v !== 'all') p.set(k, v);
  const qs = p.toString();
  return '/trees' + (qs ? `?${qs}` : '');
}

export const treeUrl = (id: string) => `/trees/${encodeURIComponent(id)}`;
export const reportUrl = (id: string) => `/reports/${encodeURIComponent(id)}`;

/** i18n keys, resolve with t(). */
export const TAB_TITLES: Record<AppTab, string> = {
  dashboard: 'nav.dashboard',
  kebun: 'nav.kebun',
  harvest: 'nav.harvest',
  schedule: 'nav.schedule',
  trees: 'nav.trees',
  variants: 'nav.variants',
  reports: 'nav.reports',
  guide: 'nav.guide',
};
