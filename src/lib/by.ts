/** The name of the person using this phone or computer, remembered for "who did it" fields (per device only). */
const BY_KEY = 'cilowong.by';

export const readBy = (): string => {
  try {
    return localStorage.getItem(BY_KEY) || '';
  } catch {
    return '';
  }
};

export const saveBy = (v: string) => {
  try {
    if (v.trim()) localStorage.setItem(BY_KEY, v.trim());
  } catch {
    /* private mode */
  }
};
