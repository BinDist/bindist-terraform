/**
 * Tenant authentication and context types used by the data-plane authorizer.
 *
 * These are the subset of tenant types that the data plane needs to parse API
 * keys, look up tenants, resolve quotas, and build TenantContext. Tier-aware
 * quota definitions (TenantTier enum, DEFAULT_QUOTAS, etc.) live in the
 * control plane (aws-exe-dist) and are overlaid at build time.
 */

/**
 * Tenant status in lifecycle
 */
export enum TenantStatus {
  PROVISIONING = 'PROVISIONING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVING = 'ARCHIVING',
  ARCHIVED = 'ARCHIVED',
  DESTROYING = 'DESTROYING',
  DESTROYED = 'DESTROYED',
}

/**
 * Tenant-specific configuration
 */
export interface TenantConfig {
  retentionDays?: number;
  ssoEnabled?: boolean;
  webhookUrl?: string;
  allowedIpRanges?: string[];
}

/**
 * Tenant usage quotas.
 * 0 means unlimited (no quota enforced) for all fields.
 */
export interface TenantQuotas {
  maxStorageGb: number;
  maxApplications: number;
  maxCustomers?: number;
}

/**
 * Tenant entity stored in control plane
 */
export interface Tenant {
  tenantId: string;
  displayName: string;
  tier: string;
  status: TenantStatus;
  tablePrefix: string;
  s3Prefix: string;
  adminEmail: string;
  config: TenantConfig;
  createdAt: string;
  activatedAt?: string;
  suspendedAt?: string;
  archivedAt?: string;
  scheduledDeletionAt?: string;
  billingId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * API Key format: {tenantId}.{secret}
 */
export interface ParsedApiKey {
  tenantId: string;
  secret: string;
}

/**
 * API Key stored in per-tenant api-keys table
 */
export interface TenantApiKey {
  apiKeyHash: string;
  customerId: string;
  name?: string;
  secret?: string;
  createdAt: string;
  lastUsedAt?: string;
  ttl?: number;
}

/**
 * Tenant context passed through authorizer.
 * Status is not included — the authorizer gates on it before passing through.
 *
 * `isAdmin` covers both admin tiers (applications + customers management).
 * `isFinancialAdmin` is the strictly higher tier that additionally permits
 * billing, control-plane lifecycle, and TOTP account security operations.
 */
export interface TenantContext {
  tenantId: string;
  tablePrefix: string;
  s3Prefix: string;
  tier: string;
  quotas: TenantQuotas;
  customerId: string;
  isAdmin: boolean;
  isFinancialAdmin: boolean;
}

