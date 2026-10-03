import React, { useState } from 'react';
import { useFarm } from '../context/FarmContext';
import {
  LayoutDashboard,
  TableProperties,
  Sprout,
  ClipboardList,
  Menu,
  X,
} from 'lucide-react';

const DurianIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M12 3.2c0-.9.4-1.5 1.1-1.9" />
    <path d="M12 3.2c-4.6 0-8 3.6-8 8.3 0 4.7 3.4 9 8 9s8-4.3 8-9c0-4.7-3.4-8.3-8-8.3Z" />
    <path d="M7.5 8.2 6 7M16.5 8.2 18 7M12 6.5V5M5.5 12.5H4M18.5 12.5H20M8 16.5l-1 1.2M16 16.5l1 1.2M12 12v-2M9 12.5 8.2 11M15 12.5l.8-1.5" />
  </svg>
);

interface NavItem {
  id: 'dashboard' | 'trees' | 'variants' | 'reports';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export const Header: React.FC = () => {
  const { activeTab, setActiveTab, unreadReportsCount } = useFarm();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'trees',
      label: 'Trees',
      icon: TableProperties,
      // Removed red count badge per requirement 10
    },
    { id: 'variants', label: 'Variants', icon: Sprout },
    {
      id: 'reports',
      label: 'Reports',
      icon: ClipboardList,
      badge: unreadReportsCount > 0 ? (unreadReportsCount > 99 ? '99+' : `${unreadReportsCount} new`) : undefined,
    },
  ];

  return (
    <header className="sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-2.5 text-left focus:outline-none"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-xs">
                <DurianIcon className="w-5 h-5" />
              </div>
              <div>
                <span className="text-base font-bold tracking-tight text-white block leading-tight">
                  Cilowong Durian Farm
                </span>
                <span className="text-xs text-slate-400 font-medium block leading-none">
                  Orchard dashboard
                </span>
              </div>
            </button>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-emerald-400'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500 text-white border border-emerald-400 font-semibold">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Mobile hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-900 px-4 pt-2 pb-3 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold ${
                  isActive
                    ? 'bg-slate-800 text-emerald-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-emerald-500 text-white border border-emerald-400 font-semibold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
