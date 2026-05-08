/**
 * Tenant Context Utilities
 * Extract and validate tenant context from API Gateway authorizer
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { TenantContext, TenantQuotas } from '../types/tenantAuth.js';

// Re-export for consumers that import from this module
export type { TenantContext, TenantQuotas };

/**
 * Default quotas for single-tenant/open-source mode (unlimited)
 * 0 means unlimited for all quota fields
 */
const DEFAULT_QUOTAS: TenantQuotas = {
  maxStorageGb: 0,
  maxApplications: 0,
  maxCustomers: 0,
};

/**
 * Shape of the authorizer context from API Gateway
 */
interface AuthorizerContext {
  tenantId?: string;
  tablePrefix?: string;
  s3Prefix?: string;
  customerId?: string;
  tier?: string;
  isAdmin?: string;
  isFinancialAdmin?: string;
  quotas?: string | TenantQuotas;
}

/**
 * Extract tenant context from API Gateway event
 * Returns null if context is missing or invalid
 */
export function getTenantContext(event: APIGatewayProxyEvent): TenantContext | null {
  const auth = event.requestContext.authorizer as AuthorizerContext | null | undefined;

  if (!auth) {
    return null;
  }

  const tenantId = auth.tenantId;
  const tablePrefix = auth.tablePrefix;
  const s3Prefix = auth.s3Prefix;
  const customerId = auth.customerId;

  if (!tenantId || !tablePrefix || !s3Prefix || !customerId) {
    console.error('Missing tenant context fields', { tenantId, tablePrefix, s3Prefix, customerId });
    return null;
  }

  // Parse quotas from authorizer context (passed as JSON string)
  let quotas: TenantQuotas = DEFAULT_QUOTAS;
  if (auth.quotas) {
    try {
      quotas = typeof auth.quotas === 'string' ? JSON.parse(auth.quotas) as TenantQuotas : auth.quotas;
    } catch {
      console.warn('Failed to parse quotas from authorizer, using defaults');
    }
  }

  return {
    tenantId,
    tablePrefix,
    s3Prefix,
    customerId,
    tier: auth.tier || 'Trial',
    isAdmin: auth.isAdmin === 'true',
    isFinancialAdmin: auth.isFinancialAdmin === 'true',
    quotas,
  };
}

/**
 * Get S3 bucket name for applications
 * Uses APPLICATIONS_BUCKET env var (set by Terraform) or constructs from context.
 * On Scaleway multi-tenant, APPLICATIONS_BUCKET is empty and AWS_ACCOUNT_ID is
 * unset, so per-tenant buckets are named `${s3Prefix}-applications` (no suffix).
 */
export function getApplicationsBucket(context: TenantContext): string {
  if (process.env.APPLICATIONS_BUCKET) {
    return process.env.APPLICATIONS_BUCKET;
  }
  const accountId = process.env.AWS_ACCOUNT_ID;
  return accountId
    ? `${context.s3Prefix}-applications-${accountId}`
    : `${context.s3Prefix}-applications`;
}
