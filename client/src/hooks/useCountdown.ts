import { useEffect, useState } from 'react';

/**
 * Seconds left until `until` (epoch ms), ticking once a second; 0 when unset or past.
 * Uses wall-clock time, so a backgrounded tab is correct as soon as it wakes up.
 */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}
