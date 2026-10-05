import React, { useEffect, useRef, useState } from 'react';
import { useFarm, AppTab } from '../context/FarmContext';
import { Link } from './Link';
import { useT, type Lang } from '../i18n';
import { LayoutDashboard, TableProperties, Sprout, ClipboardList, CalendarCheck, BookOpen, Wheat, Sheet as SheetIcon, MoreHorizontal, Users, ChevronDown } from 'lucide-react';
import { setGuideOn, useGuideOn } from '../lib/guideMode';
import { useRoute } from '../lib/router';

/** Monogram "C" with a leaf at the open end. Calm and generic on purpose. */
const BrandMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#10b981" />
        <stop offset="1" stopColor="#047857" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill="url(#brandGrad)" />
    <path d="M21.500 11.200A7.600 7.600 0 1 0 21.500 20.800" fill="none" stroke="#fff" strokeWidth="2.600" strokeLinecap="round" />
    <path d="M21 9.200c3.200-.3 5.300 1.200 5.700 4-3.200.3-5.500-1.100-5.700-4Z" fill="#a7f3d0" />
  </svg>
);

type Tone = 'new' | 'warn' | 'danger';
interface NavItem {
  id: AppTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: { text: string; tone: Tone };
  /** Where it goes when not the tab's own page (e.g. Pekerja is in Laporan > Aktivitas). */
  to?: string;
  /** Highlighted only on this exact view (?view=...), for items that share a tab. */
  view?: string;
}

const toneClass: Record<Tone, string> = {
  new: 'bg-emerald-500 text-white',
  warn: 'bg-amber-400 text-slate-900',
  danger: 'bg-rose-500 text-white',
};

/**
 * Five tabs for the daily work (Hari ini · Kebun · Laporan · Panen · Jadwal); the rest under "Lainnya":
 * the tree list, varieties, workers and, when on, the Guide.
 */
export function useNavItems(): { main: NavItem[]; more: NavItem[] } {
  const { t } = useT();
  const { unreadReportsCount, scheduleTasks } = useFarm();
  const guideOn = useGuideOn();
  const overdue = scheduleTasks.filter((t) => t.status === 'overdue').length;
  const soon = scheduleTasks.filter((t) => t.status === 'soon').length;

  let scheduleBadge: NavItem['badge'];
  if (overdue > 0) scheduleBadge = { text: t('nav.badge.overdue', { n: overdue }), tone: 'danger' };
  else if (soon > 0) scheduleBadge = { text: t('nav.badge.due', { n: soon }), tone: 'warn' };

  return {
    main: [
      { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
      { id: 'kebun', label: t('nav.kebun'), icon: SheetIcon },
      {
        id: 'reports',
        label: t('nav.reports'),
        icon: ClipboardList,
        badge:
          unreadReportsCount > 0
            ? { text: unreadReportsCount > 99 ? '99+' : t('nav.badge.new', { n: unreadReportsCount }), tone: 'new' }
            : undefined,
      },
      { id: 'harvest', label: t('nav.harvest'), icon: Wheat },
      { id: 'schedule', label: t('nav.schedule'), icon: CalendarCheck, badge: scheduleBadge },
    ],
    more: [
      { id: 'trees', label: t('nav.trees'), icon: TableProperties },
      { id: 'variants', label: t('nav.variants'), icon: Sprout },
      { id: 'reports', label: t('nav.workers'), icon: Users, to: '/reports?view=activity', view: 'activity' },
      ...(guideOn ? [{ id: 'guide' as AppTab, label: t('nav.guide'), icon: BookOpen }] : []),
    ],
  };
}

/** Is this nav item the current page? Items that share a tab (Pekerja) also match its ?view=. */
function useIsActive() {
  const route = useRoute();
  const view = route.params.get('view') || '';
  return (item: NavItem) => route.tab === item.id && (!item.view || view === item.view);
}

/** The "Lainnya" list: same links on desktop (a menu) and phones (a sheet from the bottom). */
const MoreList: React.FC<{ items: NavItem[]; onPick: () => void; dark?: boolean }> = ({ items, onPick, dark }) => {
  const isActive = useIsActive();
  return (
    <ul className="py-1">
      {items.map((item) => {
        const Icon = item.icon;
        const on = isActive(item);
        return (
          <li key={`${item.id}${item.view || ''}`}>
            <Link
              to={item.to || tabPath(item.id)}
              onClick={onPick}
              aria-current={on ? 'page' : undefined}
              className={`flex items-center gap-3 px-4 min-h-12 text-sm font-semibold ${
                dark ? (on ? 'text-emerald-400 bg-slate-800' : 'text-slate-200 hover:bg-slate-800') : on ? 'text-emerald-700 bg-emerald-50' : 'text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

/** Guide on/off: off is the plain app without the Guide's action plans. */
export const GuideToggle: React.FC = () => {
  const { t } = useT();
  const on = useGuideOn();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setGuideOn(!on)}
      title={on ? t('guideMode.offHint') : t('guideMode.onHint')}
      aria-label={t('guideMode.label')}
      className={`h-9 pl-2 pr-1 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
        on ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
      }`}
    >
      <BookOpen className="w-4 h-4" />
      <span className="hidden xl:inline">{t('guideMode.label')}</span>
      <span className={`w-7 h-4 rounded-full relative ${on ? 'bg-emerald-300/60' : 'bg-slate-600'}`} aria-hidden>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
};

/** The farm name and counts at the left of the header. Hidden for now so the tab titles have room. */
const SHOW_BRAND = false;

const tabPath = (id: AppTab) => (id === 'dashboard' ? '/' : `/${id}`);

/** ID | EN switch. Shows the current language; both options visible so it is obvious how to change it. */
export const LanguageToggle: React.FC = () => {
  const { lang, setLang, t } = useT();
  const opt = (code: Lang, label: string) => (
    <button
      type="button"
      onClick={() => setLang(code)}
      aria-pressed={lang === code}
      lang={code}
      className={`min-w-9 h-8 px-2 rounded-md text-xs font-bold transition-colors ${
        lang === code ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label={t('lang.label')} className="inline-flex items-center p-0.5 rounded-lg bg-slate-800 border border-slate-700">
      {opt('id', 'ID')}
      {opt('en', 'EN')}
    </div>
  );
};

export const Header: React.FC = () => {
  const { t } = useT();
  const { trees, blocks } = useFarm();
  const { main, more } = useNavItems();
  const isActive = useIsActive();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreActive = more.some((i) => !i.view && isActive(i));
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {SHOW_BRAND && (
            <Link
              to="/"
              className="flex items-center gap-3 text-left rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-400"
              aria-label={t('brand.home')}
            >
              <BrandMark className="w-9 h-9 shrink-0" />
              <span className="leading-tight">
                <span className="block font-display text-lg font-bold tracking-tight text-white">Cilowong</span>
                <span className="block text-xs text-slate-400 tabular whitespace-nowrap">
                  {trees.length > 0 ? t('brand.subCounts', { trees: trees.length, blocks: blocks.length }) : t('brand.sub')}
                </span>
              </span>
            </Link>
          )}

          {/* Desktop navigation. On phones the bottom tab bar is used instead. Titles are always shown. */}
          <nav className="hidden md:flex items-center gap-0.5 lg:gap-1" aria-label={t('nav.main')}>
            {main.map((item) => {
              const Icon = item.icon;
              const on = isActive(item);
              return (
                <Link
                  key={item.id}
                  to={tabPath(item.id)}
                  aria-current={on ? 'page' : undefined}
                  aria-label={item.badge ? `${item.label}, ${item.badge.text}` : item.label}
                  className={`flex items-center gap-2 px-2 lg:px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                    on ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 hidden lg:block" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className={`ml-0.5 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${toneClass[item.badge.tone]}`}>
                      {/* Just the number until there is room for the words, so the titles never get squeezed out. */}
                      <span className="xl:hidden">{item.badge.text.split(' ')[0]}</span>
                      <span className="hidden xl:inline">{item.badge.text}</span>
                    </span>
                  )}
                </Link>
              );
            })}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-2 lg:px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                  moreActive ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <MoreHorizontal className="w-4 h-4 hidden lg:block" />
                {t('nav.more')}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {open && (
                <div className="absolute left-0 top-full mt-1 w-56 rounded-xl bg-slate-900 border border-slate-700 shadow-lg overflow-hidden z-40">
                  <MoreList items={more} onPick={() => setOpen(false)} dark />
                </div>
              )}
            </div>
          </nav>

          <div className="flex items-center gap-2 ml-auto md:ml-4">
            <GuideToggle />
            <LanguageToggle />
          </div>
        </div>
      </div>
    </header>
  );
};

/** Fixed bottom tab bar for phones: thumb reach, labels always visible. */
export const BottomNav: React.FC = () => {
  const { t } = useT();
  const { main, more } = useNavItems();
  const isActive = useIsActive();
  const [open, setOpen] = useState(false);
  const moreActive = more.some((i) => !i.view && isActive(i));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
    {open && (
      <div className="md:hidden fixed inset-0 z-30" role="dialog" aria-modal="true" aria-label={t('nav.more')}>
        <button type="button" aria-label={t('common.close')} onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-950/40" />
        <div className="absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] bg-slate-900 border-t border-slate-700 rounded-t-2xl overflow-hidden">
          <MoreList items={more} onPick={() => setOpen(false)} dark />
        </div>
      </div>
    )}
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-900 border-t border-slate-800 pb-[env(safe-area-inset-bottom)]"
      aria-label={t('nav.main')}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${main.length + 1}, minmax(0, 1fr))` }}>
        {main.map((item) => {
          const Icon = item.icon;
          const on = isActive(item);
          return (
            <li key={item.id}>
              <Link
                to={tabPath(item.id)}
                onClick={() => setOpen(false)}
                aria-current={on ? 'page' : undefined}
                className={`relative w-full min-h-14 flex flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                  on ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                <span className="relative">
                  <Icon className="w-5 h-5" />
                  {item.badge && (
                    <span
                      className={`absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full text-xs leading-4 text-center font-bold ${toneClass[item.badge.tone]}`}
                      aria-label={item.badge.text}
                    >
                      {item.badge.text.match(/^\d+\+?/)?.[0] || '•'}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-0.5 text-[11px] leading-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen((v) => !v)}
            className={`w-full min-h-14 flex flex-col items-center justify-center gap-0.5 text-xs font-semibold ${open || moreActive ? 'text-emerald-400' : 'text-slate-400'}`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="max-w-full truncate px-0.5 text-[11px] leading-tight">{t('nav.more')}</span>
          </button>
        </li>
      </ul>
    </nav>
    </>
  );
};
