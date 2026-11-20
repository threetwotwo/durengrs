import React from 'react';
import { BookOpen, CalendarCheck, ChevronRight, KeyRound, LogOut, Package2, Sprout, Users } from 'lucide-react';
import { auth, signOut } from '../lib/auth';
import { useFarm } from '../context/FarmContext';
import { useT } from '../i18n';
import { kupasUrl } from '../lib/router';
import { Link } from './Link';
import { PageHeader } from './PageHeader';

/** #/more: the pages used less, kept out of the tab bar: schedule, variants, workers, kupas boxes, guide, access; sign out. */
export const MorePage: React.FC = () => {
  const { t } = useT();
  const { scheduleTasks } = useFarm();
  const overdue = scheduleTasks.filter((x) => x.status === 'overdue').length;
  const soon = scheduleTasks.filter((x) => x.status === 'soon').length;
  const items = [
    { to: '/schedule', icon: CalendarCheck, title: t('nav.schedule'), desc: t('more.schedule'), badge: overdue ? { text: t('nav.badge.overdue', { n: overdue }), cls: 'bg-rose-500 text-white' } : soon ? { text: t('nav.badge.due', { n: soon }), cls: 'bg-amber-400 text-slate-900' } : undefined },
    { to: '/variants', icon: Sprout, title: t('nav.variants'), desc: t('more.variants') },
    { to: '/workers', icon: Users, title: t('nav.workers'), desc: t('more.workers') },
    { to: kupasUrl(), icon: Package2, title: t('ku.title'), desc: t('more.kupas') },
    { to: '/guide', icon: BookOpen, title: t('nav.guide'), desc: t('more.guide') },
    { to: '/access', icon: KeyRound, title: t('acc.title'), desc: t('more.access') },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.more')} />
      <ul className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.to}>
              <Link to={it.to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50">
                <Icon className="w-5 h-5 text-slate-500 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold text-slate-900">
                    {it.title}
                    {it.badge && <span className={`px-1.5 rounded-full text-xs font-bold ${it.badge.cls}`}>{it.badge.text}</span>}
                  </span>
                  <span className="block text-sm text-slate-500">{it.desc}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => window.confirm(t('auth.signOut.confirm')) && signOut()}
        className="w-full flex items-center gap-3 px-4 py-3.5 bg-white rounded-xl border border-slate-200 shadow-xs hover:bg-slate-50 text-left"
      >
        <LogOut className="w-5 h-5 text-slate-500 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{t('auth.signOut')}</span>
          <span className="block text-sm text-slate-500 truncate">{auth.currentUser?.email}</span>
        </span>
      </button>
    </div>
  );
};
