import { useSyncExternalStore } from 'react';

/**
 * Guide on/off, per device (a worker's phone can stay simple while the owner keeps the Guide on).
 * Off = the plain app: records, counts and schedules without the Guide's action plans, advice lines and topic links.
 */
const KEY = 'cilowong.guide';
const listeners = new Set<() => void>();

function readInitial(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

let current = typeof window === 'undefined' ? false : readInitial();

export function setGuideOn(on: boolean) {
  if (on === current) return;
  current = on;
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* storage can be unavailable (private mode) */
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const get = () => current;

export function useGuideOn(): boolean {
  return useSyncExternalStore(subscribe, get, get);
}
