const en = 'en-GB';

export const formatNumber = (n: number, digits?: number) =>
  n.toLocaleString(
    'en-US',
    digits === undefined ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits },
  );

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 14 Oct 2026, 10:58 */
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(en, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** 14 Oct 2026 */
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(en, { day: 'numeric', month: 'short', year: 'numeric' });

/** 14 Oct, 10:58 */
export const formatShortDateTime = (iso: string) =>
  new Date(iso).toLocaleString(en, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** 14 Oct */
export const formatDayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString(en, { day: 'numeric', month: 'short' });

/** 2026-10-14 11:52:08 (audit log, local time) */
export function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Time if today, otherwise "12 Oct" (dashboard lists). */
export function formatWhen(iso: string, now = new Date()) {
  const d = new Date(iso);
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString(en, { hour: '2-digit', minute: '2-digit' })
    : formatDayMonth(iso);
}

/** 0:42 */
export const formatCountdown = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${formatNumber(n)} ${n === 1 ? one : many}`;

/** Initials for the avatar: "Rauf Karimli" -> "RK". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .join('')
    .slice(0, 2);
