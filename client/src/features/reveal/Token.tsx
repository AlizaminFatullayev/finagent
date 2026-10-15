import type { CSSProperties } from 'react';
import { TokenChip } from '../../components/ui/TokenChip';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { useCountdown } from '../../hooks/useCountdown';
import { formatCountdown, plural } from '../../lib/format';
import { splitTokens } from '../../lib/tokens';
import { MAX_REVEAL } from './constants';
import { useReveal } from './RevealProvider';

/** A token wired to the page's reveal store; a plain label outside one (e.g. inside links). */
export function Token({
  token,
  selectable,
  style,
}: {
  token: string;
  selectable?: boolean;
  style?: CSSProperties;
}) {
  const reveal = useReveal();
  if (!reveal) return <TokenChip token={token} style={style} />;
  const value = reveal.values[token];
  if (value !== undefined)
    return <TokenChip token={token} value={value} onHide={() => reveal.hide(token)} style={style} />;
  const selected = reveal.selected.includes(token);
  return (
    <TokenChip
      token={token}
      selectable={selectable}
      selected={selected}
      onToggle={selectable ? () => reveal.toggleSelect(token) : undefined}
      onShow={() => reveal.requestReveal([token])}
      style={style}
    />
  );
}

/** Server text with every `[TYPE_n]` token rendered as a revealable chip; everything else as text. */
export function TokenText({ text }: { text: string }) {
  return (
    <>
      {splitTokens(text).map((seg, i) =>
        'token' in seg ? <Token key={i} token={seg.token} /> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

/** "3 values revealed. They hide again in 0:42 or when you leave this page." + Hide all. */
export function RevealBanner({ style }: { style?: CSSProperties }) {
  const reveal = useReveal();
  const seconds = useCountdown(reveal?.expiresAt ?? null);
  const count = reveal ? Object.keys(reveal.values).length : 0;
  if (!reveal || count === 0) return null;
  return (
    <div className="banner warn" style={{ alignItems: 'center', ...style }} role="status">
      <Icon name="clock" className="ic" />
      <span className="grow">
        <span className="w5">{plural(count, 'value')} revealed.</span>{' '}
        <span className="sec">
          They hide again in <span className="mono">{formatCountdown(seconds)}</span> or when you leave this
          page.
        </span>
      </span>
      <Button size="sm" onClick={reveal.hideAll}>
        Hide all
      </Button>
    </div>
  );
}

/** "2 selected · Clear · Reveal selected" for tables (max 50 per request). */
export function RevealSelection() {
  const reveal = useReveal();
  if (!reveal) return null;
  const n = reveal.selected.length;
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      {n > 0 && (
        <>
          <span className="t12 sec" aria-live="polite">
            {n} selected{n >= MAX_REVEAL && ` (max ${MAX_REVEAL})`}
          </span>
          <Button size="sm" onClick={reveal.clearSelection}>
            Clear
          </Button>
        </>
      )}
      <Button size="sm" disabled={n === 0} onClick={() => reveal.requestReveal(reveal.selected)}>
        <Icon name="eye" />
        Reveal selected
      </Button>
    </div>
  );
}
