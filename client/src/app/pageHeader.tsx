import { createContext, use, useEffect, type ReactNode } from 'react';
import type { Crumb } from '../components/shell/TopBar';

type Header = { crumbs: Crumb[]; mobileAction?: ReactNode };
export const PageHeaderContext = createContext<(header: Header) => void>(() => {});

/** Sets the breadcrumbs (desktop top bar), the mobile header title/back link and the document title. */
export function usePageHeader(crumbs: Crumb[], mobileAction?: ReactNode) {
  const set = use(PageHeaderContext);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    set({ crumbs, mobileAction });
    document.title = `${crumbs.at(-1)?.label ?? 'FinAgent'} · FinAgent`;
    // Crumbs are compared by value; the action element is refreshed together with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, key]);
}
