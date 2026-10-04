import React from 'react';
import { navigate } from '../lib/router';
import { useGuideOn } from '../lib/guideMode';

/** Real anchor (middle-click, copy link, screen readers) that navigates without a page reload. */
export const Link: React.FC<
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string; replace?: boolean }
> = ({ to, replace, onClick, children, ...rest }) => (
  <a
    href={'#' + (to.startsWith('/') ? to : '/' + to)}
    onClick={(e) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      navigate(to, { replace });
    }}
    {...rest}
  >
    {children}
  </a>
);

/** A link into the Guide that turns into plain text when the Guide is switched off (see lib/guideMode). */
export const GuideLink: React.FC<{ to: string; className?: string; children: React.ReactNode }> = ({ to, className, children }) =>
  useGuideOn() ? (
    <Link to={to} className={className}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
