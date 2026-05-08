/**
 * Input validation utilities using Joi
 */

import Joi from 'joi';
import { FileType } from '../types/entities.js';

/**
 * Validated application list query parameters (before tag parsing)
 */
export interface ApplicationListQueryRaw {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
  tags?: string;
  sortBy: 'name' | 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
}

/**
 * Parsed application list query parameters (after tag parsing)
 */
export interface ApplicationListQuery {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
  tags?: string[];
  sortBy: 'name' | 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
}

/**
 * Validate a filename is safe (no paths, no dangerous characters)
 */
function validateFileName(value: string, helpers: Joi.CustomHelpers) {
  // Block path separators
  if (value.includes('/') || value.includes('\\')) {
    return helpers.error('string.pathSeparator');
  }

  // Block path traversal
  if (value.includes('..')) {
    return helpers.error('string.pathTraversal');
  }

  // Block control characters (0x00-0x1F) and DEL (0x7F)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(value)) {
    return helpers.error('string.controlChars');
  }

  // Block characters that break HTTP headers or are unsafe
  if (/["'\r\n]/.test(value)) {
    return helpers.error('string.headerUnsafe');
  }

  // Block leading/trailing dots (hidden files, extension-only names)
  if (value.startsWith('.') || value.endsWith('.')) {
    return helpers.error('string.invalidDots');
  }

  // Block leading/trailing whitespace
  if (value !== value.trim()) {
    return helpers.error('string.untrimmed');
  }

  return value;
}

/**
 * Common validation patterns
 */
const patterns = {
  id: Joi.string().min(1).max(100).pattern(/^[a-zA-Z0-9_-]+$/),
  version: Joi.string().min(1).max(50).pattern(/^[a-zA-Z0-9._-]+$/),
  name: Joi.string().min(1).max(200).trim(),
  description: Joi.string().max(2000).trim().allow(''),
  tags: Joi.array().items(Joi.string().min(1).max(50)).max(20),
  fileName: Joi.string()
    .min(1)
    .max(255)
    .custom(validateFileName)
    .messages({
      'string.pathSeparator': '{{#label}} cannot contain path separators (/ or \\)',
      'string.pathTraversal': '{{#label}} cannot contain path traversal sequences (..)',
      'string.controlChars': '{{#label}} cannot contain control characters',
      'string.headerUnsafe': '{{#label}} cannot contain quotes or newlines',
      'string.invalidDots': '{{#label}} cannot start or end with a dot',
      'string.untrimmed': '{{#label}} cannot have leading or trailing whitespace',
    }),
};

/**
 * Application list query validation
 */
export const applicationListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().max(200).trim().allow(''),
  isActive: Joi.boolean(),
  tags: Joi.string().max(500), // Comma-separated tags
  sortBy: Joi.string().valid('name', 'createdAt', 'updatedAt').default('name'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

/**
 * Download URL query validation
 */
export const downloadUrlQuerySchema = Joi.object({
  applicationId: patterns.id.required(),
  version: patterns.version.required(),
  fileId: patterns.id,
});

/**
 * Upload request validation
 */
export const uploadRequestSchema = Joi.object({
  applicationId: patterns.id.required(),
  version: patterns.version.required(),
  releaseNotes: Joi.string().max(5000).trim().allow(''),
  fileName: patterns.fileName.required(),
  fileType: Joi.string().valid(...Object.values(FileType)).default(FileType.MAIN),
  description: patterns.description,
  fileContent: Joi.string().allow(''), // Base64 encoded file content
});

/**
 * Large upload URL request validation
 */
export const largeUploadUrlRequestSchema = Joi.object({
  applicationId: patterns.id.required(),
  version: patterns.version.required(),
  fileName: patterns.fileName.required(),
  fileSize: Joi.number().integer().min(1).required(),
  contentType: Joi.string().max(100).default('application/octet-stream'),
});

/**
 * Complete large upload request validation
 */
export const completeLargeUploadRequestSchema = Joi.object({
  uploadId: Joi.string().required(),
  applicationId: patterns.id.required(),
  version: patterns.version.required(),
  fileName: patterns.fileName.required(),
  fileSize: Joi.number().integer().min(1).required(),
  checksum: Joi.string().min(32).max(128).required(),
  releaseNotes: Joi.string().max(5000).trim().allow(''),
});

/**
 * Create API key request validation
 */
export const createApiKeyRequestSchema = Joi.object({
  name: patterns.name.required(),
  notes: patterns.description,
  email: Joi.string().email().max(320).allow('', null),
  reference: Joi.string().max(200).trim().allow('', null),
  license: Joi.string().max(500).trim().allow('', null),
});

/**
 * Create application request validation
 */
export const createApplicationRequestSchema = Joi.object({
  applicationId: patterns.id.required(),
  name: patterns.name.required(),
  description: patterns.description,
  tags: patterns.tags,
});

/**
 * Validate and return parsed data, or throw validation error
 */
export function validate<T>(schema: Joi.Schema, data: unknown): T {
  const result = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (result.error) {
    const details = result.error.details.map((d) => ({
      field: d.path.join('.'),
      message: d.message,
    }));

    const validationError = new Error(
      `Validation failed: ${details.map((d) => d.message).join(', ')}`
    );
    validationError.name = 'ValidationError';
    (validationError as { details?: unknown }).details = details;
    throw validationError;
  }

  return result.value as T;
}

/**
 * Parse query string parameters for list endpoints
 */
export function parseListQuery(queryParams: Record<string, string | undefined> | null): ApplicationListQuery {
  const params = queryParams || {};

  const validated = validate<ApplicationListQueryRaw>(applicationListQuerySchema, {
    page: params.page ? parseInt(params.page, 10) : undefined,
    limit: params.limit ? parseInt(params.limit, 10) : undefined,
    search: params.search,
    isActive: params.isActive ? params.isActive === 'true' : undefined,
    tags: params.tags,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });

  // Parse comma-separated tags
  let tags: string[] | undefined;
  if (validated.tags) {
    tags = validated.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
  }

  return {
    ...validated,
    tags,
  };
}

/**
 * Sanitize a filename for safe use in Content-Disposition headers and S3 keys.
 * This is defense-in-depth - validation should catch issues first, but this
 * ensures safety even if validation is bypassed or misconfigured.
 */
export function sanitizeFileName(fileName: string): string {
  const result = fileName
    // Replace path separators
    .replace(/[/\\]/g, '_')
    // Replace path traversal sequences
    .replace(/\.\./g, '_')
    // Replace control characters, DEL, and header-unsafe chars with underscore
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f"'\r\n]/g, '_')
    // Trim whitespace
    .trim()
    // Replace leading/trailing dots
    .replace(/^\.+|\.+$/g, '_')
    // Collapse multiple underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores that resulted from sanitization
    .replace(/^_+|_+$/g, '');

  // Ensure non-empty (fallback to 'file' if completely sanitized away)
  return result || 'file';
}

export const validation = {
  patterns,
  applicationListQuerySchema,
  downloadUrlQuerySchema,
  uploadRequestSchema,
  largeUploadUrlRequestSchema,
  completeLargeUploadRequestSchema,
  createApiKeyRequestSchema,
  createApplicationRequestSchema,
  validate,
  parseListQuery,
  sanitizeFileName,
};
