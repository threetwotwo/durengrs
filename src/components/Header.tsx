import React, { useEffect, useRef } from 'react';
import { useFarm, AppTab } from '../context/FarmContext';
import { Link } from './Link';
import { useT, type Lang } from '../i18n';
import { LayoutDashboard, Sprout, ClipboardList, CalendarCheck, BookOpen, Wheat, Sheet as SheetIcon, Users, Stethoscope } from 'lucide-react';
import { setGuideOn, useGuideOn } from '../lib/guideMode';
import { useRoute } from '../lib/router';
import { isDue, isOpen } from '../lib/cases';

type Tone = 'new' | 'warn' | 'danger' | 'muted';
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
  muted: 'bg-slate-700 text-slate-200',
};

/** Every page, always visible: the daily work first, then the farm's set-up. The Guide shows when it is on. */
function useNavItems(): NavItem[] {
  const { t } = useT();
  const { unreadReportsCount, scheduleTasks, cases } = useFarm();
  const guideOn = useGuideOn();
  const overdue = scheduleTasks.filter((x) => x.status === 'overdue').length;
  const soon = scheduleTasks.filter((x) => x.status === 'soon').length;
  const open = cases.filter(isOpen).length;
  const due = cases.filter((c) => isDue(c)).length;

  let scheduleBadge: NavItem['badge'];
  if (overdue > 0) scheduleBadge = { text: t('nav.badge.overdue', { n: overdue }), tone: 'danger' };
  else if (soon > 0) scheduleBadge = { text: t('nav.badge.due', { n: soon }), tone: 'warn' };

  return [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'trees', label: t('nav.trees'), icon: SheetIcon },
    {
      id: 'reports',
      label: t('nav.reports'),
      icon: ClipboardList,
      badge: unreadReportsCount > 0 ? { text: unreadReportsCount > 99 ? '99+' : t('nav.badge.new', { n: unreadReportsCount }), tone: 'new' } : undefined,
    },
    {
      id: 'problems',
      label: t('nav.problems'),
      icon: Stethoscope,
      badge: open ? { text: due ? t('nav.badge.dueChecks', { n: due }) : String(open), tone: due ? 'danger' : 'muted' } : undefined,
    },
    { id: 'harvest', label: t('nav.harvest'), icon: Wheat },
    { id: 'schedule', label: t('nav.schedule'), icon: CalendarCheck, badge: scheduleBadge },
    { id: 'variants', label: t('nav.variants'), icon: Sprout },
    { id: 'workers', label: t('nav.workers'), icon: Users },
    ...(guideOn ? [{ id: 'guide' as AppTab, label: t('nav.guide'), icon: BookOpen }] : []),
  ];
}

const tabPath = (id: AppTab) => (id === 'dashboard' ? '/' : `/${id}`);

/** Keeps the current tab in view when the bar scrolls sideways (narrow screens). */
function useActiveInView(dep: string) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector('[aria-current="page"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [dep]);
  return ref;
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
  const items = useNavItems();
  const route = useRoute();
  const navRef = useActiveInView(route.tab);

  return (
    <header className="sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 h-14">
          {/* Desktop navigation: every page. On phones the bottom tab bar is used instead. */}
          <nav
            ref={navRef}
            className="hidden md:flex items-center gap-0.5 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label={t('nav.main')}
          >
            {items.map((item) => {
              const Icon = item.icon;
              const on = route.tab === item.id;
              return (
                <Link
                  key={item.id}
                  to={tabPath(item.id)}
                  aria-current={on ? 'page' : undefined}
                  aria-label={item.badge ? `${item.label}, ${item.badge.text}` : item.label}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                    on ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 hidden xl:block" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className={`px-1.5 min-w-5 text-center rounded-full text-xs font-bold tabular ${toneClass[item.badge.tone]}`}>
                      {item.badge.text.match(/^\d+\+?/)?.[0] || item.badge.text}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            <GuideToggle />
            <LanguageToggle />
          </div>
        </div>
      </div>
    </header>
  );
};

/** Bottom tab bar for phones: every page, scrolling sideways; labels always visible. */
export const BottomNav: React.FC = () => {
  const { t } = useT();
  const items = useNavItems();
  const route = useRoute();
  const navRef = useActiveInView(route.tab);

  return (
    <nav
      ref={navRef}
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-900 border-t border-slate-800 pb-[env(safe-area-inset-bottom)] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label={t('nav.main')}
    >
      <ul className="flex min-w-full">
        {items.map((item) => {
          const Icon = item.icon;
          const on = route.tab === item.id;
          return (
            <li key={item.id} className="flex-1 min-w-[4.5rem]">
              <Link
                to={tabPath(item.id)}
                aria-current={on ? 'page' : undefined}
                aria-label={item.badge ? `${item.label}, ${item.badge.text}` : item.label}
                className={`relative w-full min-h-14 flex flex-col items-center justify-center gap-0.5 font-semibold ${on ? 'text-emerald-400' : 'text-slate-400'}`}
              >
                <span className="relative">
                  <Icon className="w-5 h-5" />
                  {item.badge && (
                    <span className={`absolute -top-1.5 -right-3 min-w-4 h-4 px-1 rounded-full text-[10px] leading-4 text-center font-bold ${toneClass[item.badge.tone]}`} aria-hidden>
                      {item.badge.text.match(/^\d+\+?/)?.[0] || '•'}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-1 text-[11px] leading-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
