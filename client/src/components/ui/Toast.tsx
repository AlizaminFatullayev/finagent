import type { ReactNode } from 'react';
import { toast, Toaster } from 'sonner';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

type ToastOptions = {
  icon: IconName;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  /** Errors announce assertively; everything else politely. */
  error?: boolean;
  duration?: number;
};

/** Shows a `.toast` from the design; sonner provides the queue, timing and live region. */
export function notify({ icon, title, body, action, error, duration }: ToastOptions) {
  return toast.custom(
    (id) => (
      <div className="toast" role={error ? 'alert' : 'status'}>
        <Icon name={icon} style={{ marginTop: 2 }} />
        <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
          <span className="w5">{title}</span>
          {body && <span className="t12 sec ellipsis">{body}</span>}
          {action}
        </div>
        <Button variant="ghost" size="sm" icon aria-label="Dismiss" onClick={() => toast.dismiss(id)}>
          <Icon name="x" />
        </Button>
      </div>
    ),
    { duration: duration ?? (error ? 10_000 : 6_000) },
  );
}

export function ToastHost() {
  return (
    <Toaster
      position="bottom-right"
      offset={24}
      gap={8}
      visibleToasts={4}
      toastOptions={{ unstyled: true }}
    />
  );
}
