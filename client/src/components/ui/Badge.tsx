import type { ReactNode } from 'react';
import type { FileStatus, Role, Severity } from '../../api/types';
import { cx } from '../../lib/cx';

const STATUS: Record<FileStatus, [string, string]> = {
  UPLOADED: ['', 'Uploaded'],
  PROCESSING: ['b-processing', 'Processing'],
  READY: ['b-ready', 'Ready'],
  FAILED: ['b-failed', 'Failed'],
};

export function StatusBadge({ status }: { status: FileStatus }) {
  const [cls, label] = STATUS[status];
  return <span className={cx('badge', cls)}>{label}</span>;
}

const SEVERITY: Record<Severity, [string, string]> = {
  LOW: ['', 'Low'],
  MEDIUM: ['sev-med', 'Medium'],
  HIGH: ['sev-high', 'High'],
};
export const severityLabel = (s: Severity) => SEVERITY[s][1];

/** Severity is never color alone: Low dot, Medium square, High diamond, always with a label. */
export function SeverityBadge({
  severity,
  children,
  className,
}: {
  severity: Severity;
  children?: ReactNode;
  className?: string;
}) {
  const [cls, label] = SEVERITY[severity];
  return <span className={cx('badge', cls, className)}>{children ?? label}</span>;
}

/** Success / failed outcome pill (webhook deliveries, audit). */
export function OutcomeBadge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <span className={cx('badge', ok ? 'b-success' : 'b-failed')}>{children}</span>;
}

export const roleLabel = (role: Role) => role[0] + role.slice(1).toLowerCase();

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return <span className={cx('role', role === 'ADMIN' && 'admin', className)}>{roleLabel(role)}</span>;
}

/** Mono tag: column types, audit actions, events, file extensions. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('tag', className)}>{children}</span>;
}
