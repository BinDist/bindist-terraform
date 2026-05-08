/**
 * Application Constants
 * Centralized configuration values and magic numbers
 */

// =============================================================================
// API Configuration
// =============================================================================

/**
 * Current API version string included in all responses
 */
export const API_VERSION = '1.0.0';

// =============================================================================
// Time Durations (in seconds unless otherwise noted)
// =============================================================================

/**
 * Pre-signed URL expiry time for downloads and uploads (30 minutes)
 */
export const PRESIGNED_URL_EXPIRY_SECONDS = 30 * 60;

/**
 * Backup download URL expiry time (1 hour)
 */
export const BACKUP_URL_EXPIRY_SECONDS = 3600;

/**
 * CORS max age for S3 buckets (1 hour)
 */
export const CORS_MAX_AGE_SECONDS = 3600;

// =============================================================================
// TTL Durations (in seconds)
// =============================================================================

/**
 * Download records TTL (90 days)
 */
export const DOWNLOAD_RECORDS_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Upload records TTL (90 days)
 */
export const UPLOAD_RECORDS_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Operation records TTL (30 days)
 */
export const OPERATION_RECORDS_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Tenant event records TTL (2 years / 730 days)
 */
export const TENANT_EVENT_TTL_SECONDS = 730 * 24 * 60 * 60;

// =============================================================================
// Share Link Configuration
// =============================================================================

/**
 * Default share link expiry (30 minutes)
 */
export const SHARE_LINK_DEFAULT_EXPIRY_MINUTES = 30;

/**
 * Minimum share link expiry (5 minutes)
 */
export const SHARE_LINK_MIN_EXPIRY_MINUTES = 5;

/**
 * Maximum share link expiry (24 hours)
 */
export const SHARE_LINK_MAX_EXPIRY_MINUTES = 1440;

// =============================================================================
// Storage Configuration
// =============================================================================

/**
 * CloudWatch metric lookback period for quota calculation (3 days)
 */
export const QUOTA_METRIC_LOOKBACK_DAYS = 3;

/**
 * CloudWatch metric period in seconds (1 day)
 */
export const QUOTA_METRIC_PERIOD_SECONDS = 86400;

// =============================================================================
// Validation Limits
// =============================================================================

/**
 * Maximum length for description fields
 */
export const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * Maximum length for release notes
 */
export const MAX_RELEASE_NOTES_LENGTH = 5000;

/**
 * Maximum applications per customer
 */
export const MAX_APPLICATIONS_PER_CUSTOMER = 1000;

// =============================================================================
// Batch Sizes
// =============================================================================

/**
 * S3 delete objects batch size limit
 */
export const S3_DELETE_BATCH_SIZE = 1000;

/**
 * DynamoDB scan progress log interval
 */
export const DYNAMO_SCAN_LOG_INTERVAL = 1000;

// =============================================================================
// Tenant Archival
// =============================================================================

/**
 * Default retention days for archived tenant data before permanent deletion
 */
export const DEFAULT_ARCHIVE_RETENTION_DAYS = 14;

// =============================================================================
// API Key Generation
// =============================================================================

/**
 * Characters used for API key generation
 */
export const API_KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate TTL timestamp from now + duration in seconds
 */
export function calculateTtl(durationSeconds: number): number {
  return Math.floor(Date.now() / 1000) + durationSeconds;
}

/**
 * Calculate expiry date from now + duration in seconds
 */
export function calculateExpiryDate(durationSeconds: number): Date {
  return new Date(Date.now() + durationSeconds * 1000);
}
