/**
 * Back to the top of the page, as a tap on an iPhone's status bar does in other apps: the page, and any area that
 * scrolls by itself (marked `data-scroll-area`, e.g. the Count sheet). Smooth unless the phone asks for less motion.
 */
export function scrollToTop() {
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
  window.scrollTo({ top: 0, behavior });
  document.querySelectorAll<HTMLElement>('[data-scroll-area]').forEach((el) => el.scrollTo({ top: 0, behavior }));
}
