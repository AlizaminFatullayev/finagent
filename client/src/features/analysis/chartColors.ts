import { useSyncExternalStore } from 'react';

const NAMES = [
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-grid',
  'text-muted',
  'text-primary',
  'border-strong',
  'sev-high-fg',
  'sev-med-fg',
  'surface-tertiary',
  'surface-primary',
] as const;
export type ChartColors = Record<(typeof NAMES)[number], string>;

let cache: { key: string; colors: ChartColors } | null = null;

/** Resolved token colors for SVG attributes; recomputed when the theme class on <html> changes. */
function read(): ChartColors {
  const key = document.documentElement.className;
  if (cache?.key === key) return cache.colors;
  const style = getComputedStyle(document.documentElement);
  const colors = Object.fromEntries(
    NAMES.map((n) => [n, style.getPropertyValue(`--${n}`).trim() || 'currentColor']),
  ) as ChartColors;
  cache = { key, colors };
  return colors;
}

function subscribe(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

export const useChartColors = () => useSyncExternalStore(subscribe, read, read);
