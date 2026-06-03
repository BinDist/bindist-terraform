/**
 * Tests for the quota checks.
 *
 * These functions decide whether a tenant may create another app/customer
 * or store more bytes. The interesting behaviour is the boundary handling,
 * and a deliberate asymmetry that's easy to get wrong in a refactor:
 *
 *   - application & customer quotas reject AT the limit (current >= limit)
 *   - storage quota rejects only OVER the limit (projected > limit), so an
 *     upload that lands exactly on the limit is allowed.
 *
 * Also: a limit of 0 means "unlimited" and must short-circuit before any
 * database read. The per-tenant counts come from multiTenantDynamoService,
 * which is mocked so the tests exercise the decision logic, not DynamoDB.
 */

import { describe, test, expect, vi, beforeEach, type Mocked } from 'vitest';
import { checkApplicationQuota, checkCustomerQuota, checkStorageQuota } from './quotaEnforcementService.js';
import type { TenantContext, TenantQuotas } from '../utils/tenantContext.js';

vi.mock('./multiTenantDynamoService.js', () => ({
  countApplications: vi.fn(),
  countActiveNonAdminCustomers: vi.fn(),
  getStorageUsageBytes: vi.fn(),
}));
import * as dynamo from './multiTenantDynamoService.js';

const mockDynamo = dynamo as Mocked<typeof dynamo>;
const GB = 1024 * 1024 * 1024;

/** Minimal tenant context carrying only the quota fields under test. */
function ctxWith(quotas: Partial<TenantQuotas>): TenantContext {
  return {
    tenantId: 't1',
    tablePrefix: 'tp_',
    s3Prefix: 's3p',
    customerId: 'c1',
    tier: 'Pro',
    isAdmin: false,
    isFinancialAdmin: false,
    quotas: { maxStorageGb: 0, maxApplications: 0, maxCustomers: 0, ...quotas },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkApplicationQuota', () => {
  test('a limit of 0 is unlimited and skips the count query', async () => {
    const result = await checkApplicationQuota(ctxWith({ maxApplications: 0 }), true);
    expect(result).toMatchObject({ allowed: true, limit: 0 });
    expect(mockDynamo.countApplications).not.toHaveBeenCalled();
  });

  test('a non-new application is always allowed without counting', async () => {
    // Editing an existing app doesn't add to the total, so no need to check.
    const result = await checkApplicationQuota(ctxWith({ maxApplications: 5 }), false);
    expect(result.allowed).toBe(true);
    expect(mockDynamo.countApplications).not.toHaveBeenCalled();
  });

  test('allows a new application below the limit', async () => {
    mockDynamo.countApplications.mockResolvedValue(4);
    const result = await checkApplicationQuota(ctxWith({ maxApplications: 5 }), true);
    expect(result).toMatchObject({ allowed: true, current: 4, limit: 5 });
  });

  test('rejects a new application AT the limit (>= boundary)', async () => {
    mockDynamo.countApplications.mockResolvedValue(5);
    const result = await checkApplicationQuota(ctxWith({ maxApplications: 5 }), true);
    expect(result.allowed).toBe(false);
    expect(result.message).toMatch(/quota exceeded/i);
  });
});

describe('checkCustomerQuota', () => {
  test('a limit of 0 is unlimited and skips the count query', async () => {
    const result = await checkCustomerQuota(ctxWith({ maxCustomers: 0 }));
    expect(result).toMatchObject({ allowed: true, limit: 0 });
    expect(mockDynamo.countActiveNonAdminCustomers).not.toHaveBeenCalled();
  });

  test('allows below the limit and forwards excludeCustomerId to the count', async () => {
    mockDynamo.countActiveNonAdminCustomers.mockResolvedValue(2);
    const result = await checkCustomerQuota(ctxWith({ maxCustomers: 3 }), 'exclude-me');
    expect(result.allowed).toBe(true);
    // The exclusion id must reach the count query, or an update would be
    // double-counted against its own tenant.
    expect(mockDynamo.countActiveNonAdminCustomers).toHaveBeenCalledWith('tp_', 'exclude-me');
  });

  test('rejects AT the limit (>= boundary)', async () => {
    mockDynamo.countActiveNonAdminCustomers.mockResolvedValue(3);
    const result = await checkCustomerQuota(ctxWith({ maxCustomers: 3 }));
    expect(result.allowed).toBe(false);
  });
});

describe('checkStorageQuota', () => {
  test('a limit of 0 is unlimited and skips the usage query', async () => {
    const result = await checkStorageQuota(ctxWith({ maxStorageGb: 0 }), 100);
    expect(result).toMatchObject({ allowed: true, limit: 0 });
    expect(mockDynamo.getStorageUsageBytes).not.toHaveBeenCalled();
  });

  test('converts the GB limit to bytes', async () => {
    mockDynamo.getStorageUsageBytes.mockResolvedValue(0);
    const result = await checkStorageQuota(ctxWith({ maxStorageGb: 2 }), 0);
    expect(result.limit).toBe(2 * GB);
  });

  test('allows an upload that lands EXACTLY on the limit (> boundary)', async () => {
    // 1 GB already used, adding exactly 1 GB against a 2 GB limit -> projected
    // equals the limit. Storage uses a strict >, so this is allowed (unlike
    // the app/customer >= checks).
    mockDynamo.getStorageUsageBytes.mockResolvedValue(1 * GB);
    const result = await checkStorageQuota(ctxWith({ maxStorageGb: 2 }), 1 * GB);
    expect(result.allowed).toBe(true);
  });

  test('rejects an upload one byte over the limit', async () => {
    mockDynamo.getStorageUsageBytes.mockResolvedValue(1 * GB);
    const result = await checkStorageQuota(ctxWith({ maxStorageGb: 2 }), 1 * GB + 1);
    expect(result.allowed).toBe(false);
    expect(result.message).toMatch(/storage quota exceeded/i);
  });
});
