/**
 * Quota Enforcement Service
 * Shared quota checks for tenant resource limits
 */

import { TenantContext } from '../utils/tenantContext.js';
import * as dynamo from './multiTenantDynamoService.js';

export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  message?: string;
}

/**
 * Check if creating/enabling an application is allowed
 * @param ctx Tenant context with quotas
 * @param isNewApplication Whether this is a new application (not existing)
 */
export async function checkApplicationQuota(
  ctx: TenantContext,
  isNewApplication: boolean
): Promise<QuotaCheckResult> {
  const limit = ctx.quotas?.maxApplications ?? 0;

  // 0 means unlimited
  if (limit === 0) {
    return { allowed: true, current: 0, limit: 0 };
  }

  // Only check quota for new applications
  if (!isNewApplication) {
    return { allowed: true, current: 0, limit };
  }

  const current = await dynamo.countApplications(ctx.tablePrefix);

  if (current >= limit) {
    return {
      allowed: false,
      current,
      limit,
      message: `Application quota exceeded. Maximum ${limit} applications allowed for ${ctx.tier} tier.`,
    };
  }

  return { allowed: true, current, limit };
}

/**
 * Check if creating/enabling a customer is allowed
 * @param ctx Tenant context with quotas
 * @param excludeCustomerId Optional customer ID to exclude from count (for updates)
 */
export async function checkCustomerQuota(
  ctx: TenantContext,
  excludeCustomerId?: string
): Promise<QuotaCheckResult> {
  const limit = ctx.quotas?.maxCustomers ?? 0;

  // 0 means unlimited
  if (limit === 0) {
    return { allowed: true, current: 0, limit: 0 };
  }

  const current = await dynamo.countActiveNonAdminCustomers(ctx.tablePrefix, excludeCustomerId);

  if (current >= limit) {
    return {
      allowed: false,
      current,
      limit,
      message: `Customer quota exceeded. Maximum ${limit} customers allowed for ${ctx.tier} tier.`,
    };
  }

  return { allowed: true, current, limit };
}

const BYTES_PER_GB = 1024 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * Check if uploading `additionalBytes` more would push the tenant over
 * its storage quota. Compares against the live sum from the per-tenant
 * application_files table (same calculation as the account page's
 * usage display).
 *
 * Race condition: two concurrent uploads can each pass the gate
 * individually but together exceed the limit. Acceptable for a soft
 * quota; documented, not solved here.
 */
export async function checkStorageQuota(
  ctx: TenantContext,
  additionalBytes: number
): Promise<QuotaCheckResult> {
  const limitGb = ctx.quotas?.maxStorageGb ?? 0;
  const limit = limitGb * BYTES_PER_GB;

  // 0 means unlimited
  if (limit === 0) {
    return { allowed: true, current: 0, limit: 0 };
  }

  const current = await dynamo.getStorageUsageBytes(ctx.tablePrefix);
  const projected = current + additionalBytes;

  if (projected > limit) {
    return {
      allowed: false,
      current,
      limit,
      message: `Storage quota exceeded. Adding ${formatBytes(additionalBytes)} would put you at ${formatBytes(projected)} of ${formatBytes(limit)} allowed for ${ctx.tier} tier.`,
    };
  }

  return { allowed: true, current, limit };
}
