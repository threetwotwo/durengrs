import React from 'react';
import { useFarm, AppTab } from '../context/FarmContext';
import { Link } from './Link';
import { useT, type Lang } from '../i18n';
import { LayoutDashboard, TableProperties, Sprout, ClipboardList, CalendarCheck, BookOpen, Wheat, Sheet as SheetIcon } from 'lucide-react';
import { setGuideOn, useGuideOn } from '../lib/guideMode';

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
}

const toneClass: Record<Tone, string> = {
  new: 'bg-emerald-500 text-white',
  warn: 'bg-amber-400 text-slate-900',
  danger: 'bg-rose-500 text-white',
};

export function useNavItems(): NavItem[] {
  const { t } = useT();
  const { unreadReportsCount, scheduleTasks } = useFarm();
  const guideOn = useGuideOn();
  const overdue = scheduleTasks.filter((t) => t.status === 'overdue').length;
  const soon = scheduleTasks.filter((t) => t.status === 'soon').length;

  let scheduleBadge: NavItem['badge'];
  if (overdue > 0) scheduleBadge = { text: t('nav.badge.overdue', { n: overdue }), tone: 'danger' };
  else if (soon > 0) scheduleBadge = { text: t('nav.badge.due', { n: soon }), tone: 'warn' };

  return [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'kebun', label: t('nav.kebun'), icon: SheetIcon },
    { id: 'harvest', label: t('nav.harvest'), icon: Wheat },
    { id: 'schedule', label: t('nav.schedule'), icon: CalendarCheck, badge: scheduleBadge },
    { id: 'trees', label: t('nav.trees'), icon: TableProperties },
    { id: 'variants', label: t('nav.variants'), icon: Sprout },
    {
      id: 'reports',
      label: t('nav.reports'),
      icon: ClipboardList,
      badge:
        unreadReportsCount > 0
          ? { text: unreadReportsCount > 99 ? '99+' : t('nav.badge.new', { n: unreadReportsCount }), tone: 'new' }
          : undefined,
    },
    ...(guideOn ? [{ id: 'guide' as AppTab, label: t('nav.guide'), icon: BookOpen }] : []),
  ];
}

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
  const { activeTab, trees, blocks } = useFarm();
  const navItems = useNavItems();

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
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <Link
                  key={item.id}
                  to={tabPath(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.badge ? `${item.label}, ${item.badge.text}` : item.label}
                  className={`flex items-center gap-2 px-2 lg:px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                    isActive ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
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
  const { activeTab } = useFarm();
  const navItems = useNavItems();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-900 border-t border-slate-800 pb-[env(safe-area-inset-bottom)]"
      aria-label={t('nav.main')}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <li key={item.id}>
              <Link
                to={tabPath(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative w-full min-h-14 flex flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                  isActive ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                <span className="relative">
                  <Icon className="w-5 h-5" />
                  {item.badge && (
                    <span
                      className={`absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full text-xs leading-4 text-center font-bold ${toneClass[item.badge.tone]}`}
                      aria-label={item.badge.text}
                    >
                      {item.badge.text.replace(/\D+$/, '').replace(/\s.*/, '') || '•'}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-0.5 text-[11px] leading-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
