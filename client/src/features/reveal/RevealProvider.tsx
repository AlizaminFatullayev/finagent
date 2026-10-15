import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onSession } from '../../auth/session';
import { MAX_REVEAL, REVEAL_TTL_MS } from './constants';
import { RevealDialog } from './RevealDialog';

type Revealed = { values: Record<string, string>; expiresAt: number | null };

type RevealValue = {
  fileId: string;
  values: Record<string, string>;
  expiresAt: number | null;
  selected: string[];
  toggleSelect: (token: string) => void;
  clearSelection: () => void;
  /** Opens the reason dialog for these tokens. */
  requestReveal: (tokens: string[]) => void;
  hide: (token: string) => void;
  hideAll: () => void;
};

const RevealContext = createContext<RevealValue | null>(null);

/** null outside a provider: tokens then render as plain, non-revealable chips. */
export const useReveal = () => use(RevealContext);

const EMPTY: Revealed = { values: {}, expiresAt: null };

/**
 * Page-scoped, in-memory store of revealed PII for one file. Values never touch storage, URLs, the
 * query cache or logs. Everything re-masks 60 s after the latest reveal (checked against the wall
 * clock, so a tab left in the background is masked when it wakes), when the page unmounts, and when
 * the session ends.
 */
export function RevealProvider({ fileId, children }: { fileId: string; children: ReactNode }) {
  const [revealed, setRevealed] = useState<Revealed>(EMPTY);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogTokens, setDialogTokens] = useState<string[] | null>(null);

  const hideAll = useCallback(() => setRevealed(EMPTY), []);

  // Expiry: one timer to the deadline, plus a check whenever the tab becomes visible again.
  useEffect(() => {
    if (revealed.expiresAt === null) return;
    const check = () => {
      if (Date.now() >= (revealed.expiresAt ?? 0)) setRevealed(EMPTY);
    };
    const timer = window.setTimeout(check, Math.max(0, revealed.expiresAt - Date.now()));
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [revealed.expiresAt]);

  // Logout or expiry elsewhere in the app drops everything at once.
  useEffect(() => onSession((event) => event !== 'refreshed' && setRevealed(EMPTY)), []);

  // A different file never inherits values (the provider is keyed by page, this is belt and braces).
  const [prevFile, setPrevFile] = useState(fileId);
  if (prevFile !== fileId) {
    setPrevFile(fileId);
    setRevealed(EMPTY);
    setSelected([]);
  }

  const value = useMemo<RevealValue>(
    () => ({
      fileId,
      values: revealed.values,
      expiresAt: revealed.expiresAt,
      selected,
      toggleSelect: (token) =>
        setSelected((s) =>
          s.includes(token) ? s.filter((t) => t !== token) : s.length >= MAX_REVEAL ? s : [...s, token],
        ),
      clearSelection: () => setSelected([]),
      requestReveal: (tokens) => setDialogTokens([...new Set(tokens)].slice(0, MAX_REVEAL)),
      hide: (token) =>
        setRevealed((r) => {
          const values = { ...r.values };
          delete values[token];
          return Object.keys(values).length ? { ...r, values } : EMPTY;
        }),
      hideAll,
    }),
    [fileId, revealed, selected, hideAll],
  );

  return (
    <RevealContext value={value}>
      {children}
      <RevealDialog
        fileId={fileId}
        tokens={dialogTokens}
        onClose={() => setDialogTokens(null)}
        onRevealed={(values) => {
          setRevealed((r) => ({ values: { ...r.values, ...values }, expiresAt: Date.now() + REVEAL_TTL_MS }));
          setSelected([]);
        }}
      />
    </RevealContext>
  );
}
