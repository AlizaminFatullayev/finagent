import { z } from 'zod';
import { PageMeta, PaginationQuery } from '../../lib/pagination.js';

export const RoleSchema = z.enum(['ANALYST', 'MANAGER', 'ADMIN']).meta({ id: 'Role' });

// Bank policy baseline: long passphrase-friendly minimum plus character classes.
export const PasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a symbol');

export const UserSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
    role: RoleSchema,
    isActive: z.boolean(),
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'User' });

export const CreateUserBody = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  name: z.string().trim().min(1).max(200),
  password: PasswordSchema,
  role: RoleSchema.default('ANALYST'),
});
export type CreateUserBody = z.infer<typeof CreateUserBody>;

export const ChangeRoleBody = z.object({ role: RoleSchema });
export const UserIdParams = z.object({ id: z.uuid() });
export const ListUsersQuery = PaginationQuery;
export const UserListMeta = PageMeta;

// Public projection: never select the password hash or lockout internals.
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;
