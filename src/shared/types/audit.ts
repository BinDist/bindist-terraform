/**
 * Audit Log Types
 *
 * Types for the account audit log system that tracks payment events,
 * tier changes, and other account-related activities.
 */

/**
 * Audit event types for payment and account activities
 */
export enum AuditEventType {
  // Session lifecycle
  SESSION_CREATED = 'SESSION_CREATED',

  // Card validation (zero-auth)
  CARD_VALIDATION_SUCCESS = 'CARD_VALIDATION_SUCCESS',
  CARD_VALIDATION_FAILED = 'CARD_VALIDATION_FAILED',

  // Payment authorization
  PAYMENT_AUTHORIZED = 'PAYMENT_AUTHORIZED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',

  // First charge (scheduled job)
  FIRST_CHARGE_SUCCESS = 'FIRST_CHARGE_SUCCESS',
  FIRST_CHARGE_FAILED = 'FIRST_CHARGE_FAILED',

  // Tier changes
  TIER_UPGRADE_STARTED = 'TIER_UPGRADE_STARTED',
  TIER_UPGRADE_COMPLETED = 'TIER_UPGRADE_COMPLETED',
  TIER_DOWNGRADE_PAYMENT_FAILURE = 'TIER_DOWNGRADE_PAYMENT_FAILURE',

  // Payment method updates
  PAYMENT_METHOD_UPDATE_STARTED = 'PAYMENT_METHOD_UPDATE_STARTED',
  PAYMENT_METHOD_UPDATED = 'PAYMENT_METHOD_UPDATED',
  PAYMENT_METHOD_UPDATE_FAILED = 'PAYMENT_METHOD_UPDATE_FAILED',

  // Webhooks
  WEBHOOK_RECEIVED = 'WEBHOOK_RECEIVED',
  WEBHOOK_HMAC_FAILED = 'WEBHOOK_HMAC_FAILED',

  // Notifications
  PAYMENT_FAILURE_EMAIL_SENT = 'PAYMENT_FAILURE_EMAIL_SENT',
  PAYMENT_FAILURE_EMAIL_FAILED = 'PAYMENT_FAILURE_EMAIL_FAILED',
  WELCOME_EMAIL_SENT = 'WELCOME_EMAIL_SENT',
  WELCOME_EMAIL_FAILED = 'WELCOME_EMAIL_FAILED',

  // Storage-quota enforcement (raised by upload handlers when a request
  // would exceed the tenant's maxStorageGb).
  STORAGE_QUOTA_REJECTED = 'STORAGE_QUOTA_REJECTED',

  // Tenant provisioning (migrated from pre-tenant)
  TENANT_PROVISIONED = 'TENANT_PROVISIONED',

  // Application management
  APPLICATION_CREATED = 'APPLICATION_CREATED',
  APPLICATION_DELETED = 'APPLICATION_DELETED',

  // Customer management
  CUSTOMER_CREATED = 'CUSTOMER_CREATED',
  CUSTOMER_ENABLED = 'CUSTOMER_ENABLED',
  CUSTOMER_DISABLED = 'CUSTOMER_DISABLED',
  CUSTOMER_KEY_REGENERATED = 'CUSTOMER_KEY_REGENERATED',
  ADMIN_KEY_REGENERATED = 'ADMIN_KEY_REGENERATED',
  CUSTOMER_APP_LINKED = 'CUSTOMER_APP_LINKED',
  CUSTOMER_APP_UNLINKED = 'CUSTOMER_APP_UNLINKED',
}

/**
 * Audit event outcome
 */
export type AuditOutcome = 'SUCCESS' | 'FAILED' | 'PENDING';

/**
 * Session type for SESSION_CREATED events
 */
export type SessionType = 'SIGNUP' | 'UPGRADE' | 'PAYMENT_METHOD_UPDATE';

/**
 * Audit event record stored in DynamoDB
 */
export interface AuditEvent {
  // Primary key
  eventType: AuditEventType;
  eventId: string; // ULID for chronological ordering

  // Timestamps
  timestamp: string; // ISO 8601
  ttl: number; // Unix timestamp for TTL

  // Actor and outcome
  actor: string; // "system:webhook", "system:scheduler", "user:{email}", etc.
  outcome: AuditOutcome;

  // Context
  signupId?: string; // For pre-tenant events and reference
  paymentReference?: string; // PSP reference or merchant reference

  // Request context
  clientIp?: string;
  userAgent?: string;

  // Event-specific details
  details?: AuditEventDetails;
}

/**
 * Pre-tenant audit event (stored in global payments-audit table)
 */
export interface PreTenantAuditEvent extends AuditEvent {
  signupId: string; // Required for pre-tenant events (this is the hash key)
}

/**
 * Event-specific details by event type
 */
export interface AuditEventDetails {
  // SESSION_CREATED
  sessionType?: SessionType;
  tier?: string;
  adminEmail?: string;

  // CARD_VALIDATION_*, PAYMENT_*
  amount?: { value: number; currency: string };
  pspReference?: string;
  refusalReason?: string;
  resultCode?: string;

  // TIER_* changes
  previousTier?: string;
  newTier?: string;
  reason?: string;

  // WEBHOOK_*
  eventCode?: string;
  merchantReference?: string;
  adyenSuccess?: boolean;

  // PAYMENT_FAILURE_EMAIL_*
  recipientEmail?: string;
  emailError?: string;

  // TENANT_PROVISIONED
  displayName?: string;
  operationId?: string;

  // APPLICATION_CREATED, APPLICATION_DELETED
  applicationId?: string;
  applicationName?: string;

  // CUSTOMER_* events
  customerId?: string;
  customerName?: string;

  // STORAGE_QUOTA_REJECTED
  requestedBytes?: number;
  currentBytes?: number;
  limitBytes?: number;
  fileName?: string;

  // Generic error
  error?: string;
}

/**
 * Constants for audit log TTL (2 years in seconds)
 */
export const AUDIT_TTL_SECONDS = 2 * 365 * 24 * 60 * 60; // 730 days

/**
 * Constants for pre-tenant audit TTL (90 days - should be migrated by then)
 */
export const PRE_TENANT_AUDIT_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
