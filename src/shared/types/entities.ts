/**
 * Core entity types for application distribution system
 */

/**
 * Customer entity stored in DynamoDB.
 *
 * Two levels of admin are expressed as independent flags:
 *   - `isAdmin` — can manage applications and customers.
 *   - `isFinancialAdmin` — additionally can touch billing, the control
 *     plane (tenant lifecycle/backups), and TOTP account security.
 *
 * `isFinancialAdmin` implies `isAdmin`; a customer with only `isAdmin`
 * is the restricted "apps admin". Endpoints that need the full tier
 * gate on `isFinancialAdmin` directly.
 */
export interface Customer {
  customerId: string;
  name: string;
  apiKeyHash: string;
  isActive: boolean;
  isAdmin?: boolean;
  isFinancialAdmin?: boolean;
  createdAt: string;
  updatedAt: string;
  allowedIpRanges?: string[];
  notes?: string;
  email?: string;
  reference?: string;
  license?: string;
  parentCustomerId?: string;
  ttl?: number;
}

/**
 * Application entity stored in DynamoDB
 * One record per application containing all metadata
 */
export interface Application {
  applicationId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  latestVersion?: string;
  tags?: string[];
  /** Soft delete timestamp - if set, application is considered deleted */
  deletedAt?: string;
}

/**
 * Customer-Application access mapping
 * Links customers to the applications they can access
 */
export interface CustomerApplication {
  customerId: string;
  applicationId: string;
  grantedAt: string;
  grantedBy?: string;
}

/**
 * Version entity stored in DynamoDB
 */
export interface Version {
  applicationId: string;
  version: string;
  versionId: string;
  releaseNotes?: string;
  isActive: boolean;
  /** Whether the version is enabled for production downloads (disabled by default on first upload) */
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  fileSize: number;
  checksum: string;
  downloadCount: number;
}

/**
 * Application file entity for multi-file versions
 */
export interface ApplicationFile {
  versionId: string;
  fileId: string;
  fileName: string;
  fileType: FileType;
  fileSize: number;
  checksum: string;
  order: number;
  description?: string;
  createdAt: string;
}

/**
 * File type classification
 */
export enum FileType {
  MAIN = 'MAIN',
  DEPENDENCY = 'DEPENDENCY',
  DOCUMENTATION = 'DOCUMENTATION',
  CONFIGURATION = 'CONFIGURATION'
}

/**
 * Download tracking entity stored in DynamoDB
 */
export interface Download {
  applicationId: string;
  downloadId: string;
  customerId: string;
  versionId: string;
  fileId?: string;
  clientIp: string;
  userAgent?: string;
  downloadedAt: string;
  fileSize?: number;
  downloadSource?: 'api' | 'share';
  shareToken?: string;
  ttl?: number;
}

/**
 * Upload tracking entity stored in DynamoDB
 */
export interface Upload {
  applicationId: string;
  uploadId: string;
  customerId: string;
  versionId: string;
  version: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  checksum: string;
  fileType: FileType;
  clientIp: string;
  userAgent?: string;
  uploadedAt: string;
  uploadMethod: 'direct' | 'large';
  ipChanged?: boolean;
  previousIp?: string;
  ttl?: number;
}

/**
 * API key entity for fast lookup
 */
export interface ApiKey {
  apiKeyHash: string;
  customerId: string;
  createdAt: string;
  /** Optional name/description for the API key */
  name?: string;
  /** Secret part of API key (without tenantId prefix, for admin retrieval) */
  secret?: string;
  ttl?: number;
}

/**
 * Share token entity for public download links
 */
export interface ShareToken {
  token: string;
  applicationId: string;
  version: string;
  fileId?: string;
  customerId: string;
  tablePrefix: string;
  s3Prefix: string;
  createdAt: string;
  expiresAt: string;
  ttl: number;
}

// =============================================================================
// Backup Types
// =============================================================================

/**
 * Backup type classification
 */
export type BackupType = 'SCHEDULED' | 'MANUAL' | 'PRE_DESTROY' | 'PRE_ARCHIVE';

/**
 * Result of a single DynamoDB table export
 */
export interface TableExportInfo {
  tableName: string;
  itemCount: number;
  s3Location: string;
  status: string;
}

/**
 * Result of S3 bucket copy operation
 */
export interface S3CopyInfo {
  fileCount: number;
  totalSizeBytes: number;
  s3Location: string;
}

/**
 * Complete backup result
 */
export interface BackupResult {
  backupId: string;
  backupType: BackupType;
  manifestLocation: string;
  tableExports: TableExportInfo[];
  s3Copy: S3CopyInfo;
  completedAt: string;
}

/**
 * Backup manifest stored in S3
 */
export interface BackupManifest {
  version: '1.0';
  backupId: string;
  tenantId: string;
  backupType: BackupType;
  createdAt: string;
  completedAt: string;
  tablePrefix: string;
  s3Prefix: string;
  tables: TableExportInfo[];
  s3Data: S3CopyInfo;
}
