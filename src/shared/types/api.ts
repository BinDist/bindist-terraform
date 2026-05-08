/**
 * API request and response types
 */

import { FileType } from './entities.js';

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

/**
 * API error structure
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

/**
 * API metadata for pagination and other info
 */
export interface ApiMeta {
  pagination?: PaginationMeta;
  requestId: string;
  version: string;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Query parameters for applications list
 */
export interface ApplicationsListQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  tags?: string[];
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Application response DTO
 */
export interface ApplicationDto {
  applicationId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  latestVersion?: string;
  tags?: string[];
  customers?: ApplicationCustomerDto[]; // Only included for admin users
}

/**
 * Customer info included in application response (admin only)
 */
export interface ApplicationCustomerDto {
  customerId: string;
  name: string;
}

/**
 * Applications list response
 */
export interface ApplicationsListResponse {
  applications: ApplicationDto[];
  pagination: PaginationMeta;
}

/**
 * Version response DTO
 */
export interface VersionDto {
  versionId: string;
  applicationId: string;
  version: string;
  releaseNotes?: string;
  isActive: boolean;
  /** Whether the version is enabled for production downloads */
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  fileSize: number;
  downloadCount: number;
}

/**
 * Application file DTO
 */
export interface ApplicationFileDto {
  fileId: string;
  fileName: string;
  fileType: FileType;
  fileSize: number;
  checksum: string;
  order: number;
  description?: string;
}

/**
 * Download URL response
 */
export interface DownloadUrlResponse {
  downloadId: string;
  url: string;
  expiresAt: string;
  fileName: string;
  fileSize: number;
  checksum: string;
}

/**
 * Upload binary request (admin)
 */
export interface UploadBinaryRequest {
  applicationId: string;
  version: string;
  releaseNotes?: string;
  fileName: string;
  fileType: FileType;
  description?: string;
  fileContent?: string;
}

/**
 * Upload request (admin) - deprecated, use UploadBinaryRequest
 */
export interface UploadRequest {
  applicationId: string;
  version: string;
  releaseNotes?: string;
}

/**
 * Large upload URL request
 */
export interface LargeUploadUrlRequest {
  applicationId: string;
  version: string;
  fileName: string;
  fileSize: number;
  contentType?: string;
}

/**
 * Large upload URL response
 */
export interface LargeUploadUrlResponse {
  uploadId: string;
  uploadUrl: string;
  expiresAt: string;
}

/**
 * Complete large upload request
 */
export interface CompleteLargeUploadRequest {
  uploadId: string;
  applicationId: string;
  version: string;
  fileName: string;
  fileSize: number;
  checksum: string;
  releaseNotes?: string;
}

/**
 * Create application request
 */
export interface CreateApplicationRequest {
  customerIds?: string[];
  applicationId: string;
  name: string;
  description?: string;
  tags?: string[];
}

/**
 * Create API key request
 */
export interface CreateApiKeyRequest {
  name: string;
  notes?: string;
}

/**
 * Create API key response
 */
export interface CreateApiKeyResponse {
  customerId: string;
  apiKey: string;
  name: string;
  createdAt: string;
}

/**
 * Update customer request
 */
export interface UpdateCustomerRequest {
  isActive?: boolean;
  name?: string;
  notes?: string;
  email?: string;
  reference?: string;
  license?: string;
}

/**
 * Update version request
 */
export interface UpdateVersionRequest {
  releaseNotes?: string | null;
  isActive?: boolean;
  /** Enable or disable the version for production downloads */
  isEnabled?: boolean;
}

/**
 * Update application customers request
 */
export interface UpdateApplicationCustomersRequest {
  addCustomerIds: string[];
  removeCustomerIds: string[];
}
