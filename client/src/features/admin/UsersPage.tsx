import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, unwrap, unwrapBody } from '../../api/client';
import { ApiError, fieldErrors } from '../../api/errors';
import type { Role, User } from '../../api/types';
import { usePageHeader } from '../../app/pageHeader';
import { useUser } from '../../auth/AuthProvider';
import { ErrorState } from '../../components/ErrorState';
import { RoleBadge, roleLabel } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Controls';
import { TextField } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { Menu, Modal } from '../../components/ui/Overlays';
import { Banner, Skeleton } from '../../components/ui/Surfaces';
import { notify } from '../../components/ui/Toast';
import { LoadMore, Table } from '../../components/ui/Table';
import { formatDate, initials } from '../../lib/format';

const ROLES: Role[] = ['ANALYST', 'MANAGER', 'ADMIN'];
const ROLE_HELP: Record<Role, string> = {
  ANALYST: 'Analyst: own files only.',
  MANAGER: 'Manager: all files and exports.',
  ADMIN: 'Admin: everything, plus users, webhooks and the audit log.',
};

/** 16 characters from an unambiguous alphabet, with every class the password policy requires. */
export function generatePassword(): string {
  const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '-_!@#%+='];
  const all = sets.join('');
  const pick = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0]! % chars.length]!;
  const chars = [...sets.map(pick), ...Array.from({ length: 12 }, () => pick(all))];
  // Fisher-Yates with crypto randomness so the required classes are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

export function UsersPage() {
  const me = useUser();
  const queryClient = useQueryClient();
  usePageHeader([{ label: 'Users' }]);
  const users = useInfiniteQuery({
    queryKey: ['users', 'list'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrapBody(api.GET('/api/users', { params: { query: { limit: 50, cursor: pageParam } } })),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
  const [pending, setPending] = useState<{ user: User; role: Role } | null>(null);
  const [creating, setCreating] = useState(false);
  const change = useMutation({
    mutationFn: ({ user, role }: { user: User; role: Role }) =>
      unwrap(api.PATCH('/api/users/{id}/role', { params: { path: { id: user.id } }, body: { role } })),
    onSuccess: (u) => {
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      notify({ icon: 'check', title: 'Role changed', body: `${u.name} is now ${roleLabel(u.role)}.` });
    },
  });
  const list = users.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <main className="content" id="main">
      <div className="row between wrap" style={{ gap: 16 }}>
        <div className="col" style={{ gap: 4 }}>
          <h1 className="t24">Users</h1>
          <p className="sec">Accounts are created here only. There is no self-registration.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Icon name="plus" />
          Create user
        </Button>
      </div>
      <div className="grid-3">
        <div className="card pad16 col" style={{ gap: 8 }}>
          <RoleBadge role="ANALYST" className="self-start" />
          <span className="t14">
            Uploads and analyzes <b className="w5">own files</b>. Can reveal masked values with a reason.
          </span>
        </div>
        <div className="card pad16 col" style={{ gap: 8 }}>
          <RoleBadge role="MANAGER" className="self-start" />
          <span className="t14">
            Everything an analyst can do, on <b className="w5">all files</b>, plus exports for any analysis.
          </span>
        </div>
        <div className="card pad16 col" style={{ gap: 8 }}>
          <RoleBadge role="ADMIN" className="self-start" />
          <span className="t14">
            Everything a manager can do, plus <b className="w5">users, webhooks and the audit log</b>.
          </span>
        </div>
      </div>
      {change.isError && (
        <Banner kind="error" role="alert" title="The role wasn’t changed">
          {change.error instanceof ApiError && change.error.status === 409
            ? change.error.message
            : 'Try again in a moment.'}
        </Banner>
      )}
      {users.isError ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : (
        <div className="card" style={{ overflow: 'visible' }}>
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.isPending &&
                [1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td>
                      <Skeleton height={14} width={160} />
                    </td>
                    <td>
                      <Skeleton height={14} width={180} />
                    </td>
                    <td>
                      <Skeleton height={32} width={132} />
                    </td>
                    <td>
                      <Skeleton height={14} width={90} />
                    </td>
                  </tr>
                ))}
              {list.map((u) => {
                const self = u.id === me.id;
                const confirming = pending?.user.id === u.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <span className="row" style={{ gap: 12 }}>
                        <span className="avatar">{initials(u.name)}</span>
                        <span className="w5">{u.name}</span>
                        {self && <span className="t12 muted">You</span>}
                        {!u.isActive && <span className="t12 muted">Inactive</span>}
                      </span>
                    </td>
                    <td className="sec">{u.email}</td>
                    <td>
                      {confirming ? (
                        <div className="row" style={{ gap: 8 }}>
                          <span className="t12 sec">Change to</span>
                          <RoleBadge role={pending.role} />
                          <span className="t12 sec">?</span>
                          <Button
                            size="sm"
                            variant="primary"
                            loading={change.isPending}
                            onClick={() => change.mutate(pending)}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={change.isPending}
                            onClick={() => setPending(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Menu
                          align="start"
                          items={ROLES.filter((r) => r !== u.role).map((r) => ({
                            label: roleLabel(r),
                            onSelect: () => setPending({ user: u, role: r }),
                          }))}
                          trigger={
                            <button
                              type="button"
                              className="select select-sm"
                              aria-label={
                                self ? 'Your role (you can’t change your own role)' : `Role for ${u.name}`
                              }
                              disabled={self}
                              style={{
                                minWidth: 132,
                                opacity: self ? 0.6 : undefined,
                                cursor: self ? 'not-allowed' : undefined,
                              }}
                            >
                              <RoleBadge role={u.role} />
                              <Icon name="chevronDown" />
                            </button>
                          }
                        />
                      )}
                    </td>
                    <td className="sec">{formatDate(u.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <LoadMore
            hasMore={Boolean(users.hasNextPage)}
            loading={users.isFetchingNextPage}
            onLoad={() => void users.fetchNextPage()}
          />
        </div>
      )}
      <p className="t12 muted">You can’t change your own role. Role changes are recorded in the audit log.</p>
      {creating && <CreateUser onClose={() => setCreating(false)} />}
    </main>
  );
}

function CreateUser({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(generatePassword);
  const [role, setRole] = useState<Role>('ANALYST');
  const [copied, setCopied] = useState(false);
  const create = useMutation({
    gcTime: 0,
    mutationFn: () =>
      unwrap(api.POST('/api/users', { body: { name: name.trim(), email: email.trim(), password, role } })),
    onSuccess: (u) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      notify({ icon: 'check', title: 'User created', body: `${u.name} · ${roleLabel(u.role)}` });
      onClose();
    },
  });
  const errors = fieldErrors(create.error);
  const conflict = create.error instanceof ApiError && create.error.status === 409;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <Modal
      open
      onOpenChange={(o) => !o && !create.isPending && onClose()}
      title="Create user"
      description="Share the temporary password through a secure channel."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="create-user"
            loading={create.isPending}
            disabled={!name.trim() || !email.trim() || password.length < 12}
          >
            Create user
          </Button>
        </>
      }
    >
      <form id="create-user" className="col" style={{ gap: 16 }} onSubmit={submit} noValidate>
        <TextField
          label="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          maxLength={200}
          autoComplete="off"
          required
        />
        <TextField
          label="Work email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={conflict ? 'A user with this email already exists.' : errors.email}
          autoComplete="off"
          required
        />
        <div className="field">
          <label className="label" htmlFor="temp-password">
            Temporary password
          </label>
          <div className="row" style={{ gap: 8 }}>
            <div className="inwrap grow">
              <input
                id="temp-password"
                data-sensitive
                className={errors.password ? 'input mono is-error' : 'input mono'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setCopied(false);
                }}
                autoComplete="new-password"
                spellCheck={false}
                aria-describedby="temp-password-help"
              />
              <button
                type="button"
                className="trail"
                aria-label={copied ? 'Password copied' : 'Copy password'}
                onClick={() => void navigator.clipboard?.writeText(password).then(() => setCopied(true))}
              >
                <Icon name={copied ? 'check' : 'copy'} />
              </button>
            </div>
            <Button onClick={() => (setPassword(generatePassword()), setCopied(false))}>Generate</Button>
          </div>
          {errors.password ? (
            <span className="err" id="temp-password-help">
              {errors.password}
            </span>
          ) : (
            <span className="help" id="temp-password-help">
              At least 12 characters with upper and lower case, a digit and a symbol.
            </span>
          )}
        </div>
        <div className="field">
          <span className="label">Role</span>
          <Segmented
            label="Role"
            value={role}
            onChange={setRole}
            options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
            className="grid grid-cols-3"
          />
          <span className="help">{ROLE_HELP[role]}</span>
        </div>
        {create.isError && !conflict && Object.keys(errors).length === 0 && (
          <Banner kind="error" role="alert" title="The user wasn’t created">
            Try again in a moment.
          </Banner>
        )}
      </form>
    </Modal>
  );
}
