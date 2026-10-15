import { describe, expect, it } from 'vitest';
import type { AuditLog } from '../../api/types';
import { auditDetails } from './AuditLogPage';
import { generatePassword } from './UsersPage';
import { urlError } from './WebhooksPage';

const log = (action: string, metadata: unknown): AuditLog => ({
  id: '1',
  actorId: null,
  action,
  resourceType: 'file',
  resourceId: 'f',
  ip: null,
  userAgent: null,
  metadata,
  createdAt: '2026-10-14T11:49:31.000Z',
});

describe('auditDetails', () => {
  it('summarises reveals by count, types and reason only', () => {
    expect(
      auditDetails(
        log('pii.unmask', {
          reason: 'Case FIN-2231',
          tokenCount: 2,
          tokenTypes: ['IBAN', 'PERSON'],
          notFoundCount: 0,
        }),
      ),
    ).toBe('2 tokens: IBAN, PERSON · “Case FIN-2231”');
    expect(
      auditDetails(log('pii.unmask', { reason: 'r', tokenCount: 3, tokenTypes: ['CARD'], notFoundCount: 1 })),
    ).toContain('1 not found');
  });

  it('describes role changes, uploads and unknown actions', () => {
    expect(auditDetails(log('user.role_change', { from: 'ANALYST', to: 'MANAGER' }))).toBe(
      'ANALYST → MANAGER',
    );
    expect(auditDetails(log('file.upload', { originalName: 'q3.xlsx', sizeBytes: 2048 }))).toBe(
      'q3.xlsx · 2 KB',
    );
    expect(auditDetails(log('something.new', { a: 1 }))).toBe('a: 1');
    expect(auditDetails(log('auth.logout', null))).toBe('');
  });
});

describe('generatePassword', () => {
  it('always satisfies the server password policy', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(16);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
    }
  });
});

describe('urlError', () => {
  it('maps the SSRF rejection to the design copy', () => {
    expect(urlError('Must not point to a private, loopback or link-local address')).toMatch(
      /Private and internal addresses/,
    );
    expect(urlError('Must use https')).toBe('Use an HTTPS endpoint.');
    expect(urlError(undefined)).toBeUndefined();
  });
});
