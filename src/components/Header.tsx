import React from 'react';
import { useFarm, AppTab } from '../context/FarmContext';
import { LayoutDashboard, TableProperties, Sprout, ClipboardList, CalendarCheck } from 'lucide-react';

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
  const { unreadReportsCount, scheduleTasks } = useFarm();
  const overdue = scheduleTasks.filter((t) => t.status === 'overdue').length;
  const soon = scheduleTasks.filter((t) => t.status === 'soon').length;

  let scheduleBadge: NavItem['badge'];
  if (overdue > 0) scheduleBadge = { text: `${overdue} overdue`, tone: 'danger' };
  else if (soon > 0) scheduleBadge = { text: `${soon} due`, tone: 'warn' };

  return [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'schedule', label: 'Schedule', icon: CalendarCheck, badge: scheduleBadge },
    { id: 'trees', label: 'Trees', icon: TableProperties },
    { id: 'variants', label: 'Variants', icon: Sprout },
    {
      id: 'reports',
      label: 'Reports',
      icon: ClipboardList,
      badge:
        unreadReportsCount > 0
          ? { text: unreadReportsCount > 99 ? '99+' : `${unreadReportsCount} new`, tone: 'new' }
          : undefined,
    },
  ];
}

export const Header: React.FC = () => {
  const { activeTab, setActiveTab, trees, blocks } = useFarm();
  const navItems = useNavItems();

  return (
    <header className="sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <button
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-3 text-left rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-400"
            aria-label="Cilowong Durian Estate, go to dashboard"
          >
            <BrandMark className="w-9 h-9 shrink-0" />
            <span className="leading-tight">
              <span className="block font-display text-lg font-bold tracking-tight text-white">Cilowong</span>
              <span className="block text-xs text-slate-400 tabular">
                Durian Estate{trees.length > 0 ? ` · ${trees.length} trees · ${blocks.length} blocks` : ''}
              </span>
            </span>
          </button>

          {/* Desktop navigation. On phones the bottom tab bar is used instead. */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isActive ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className={`ml-0.5 px-2 py-0.5 rounded-full text-xs font-semibold ${toneClass[item.badge.tone]}`}>
                      {item.badge.text}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};

/** Fixed bottom tab bar for phones: thumb reach, labels always visible. */
export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab } = useFarm();
  const navItems = useNavItems();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-900 border-t border-slate-800 pb-[env(safe-area-inset-bottom)]"
      aria-label="Main"
    >
      <ul className="grid grid-cols-5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <li key={item.id}>
              <button
                onClick={() => setActiveTab(item.id)}
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
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
