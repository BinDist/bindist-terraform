/**
 * Standardized API response builders
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse, ApiError, ApiMeta, PaginationMeta } from '../types/api.js';
import { API_VERSION } from '../config/constants.js';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Channel',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

/**
 * Create a successful response
 */
export function success<T>(
  data: T,
  statusCode: number = 200,
  pagination?: PaginationMeta
): APIGatewayProxyResult {
  const meta: ApiMeta = {
    requestId: uuidv4(),
    version: API_VERSION,
  };

  if (pagination) {
    meta.pagination = pagination;
  }

  const response: ApiResponse<T> = {
    success: true,
    data,
    meta,
  };

  return {
    statusCode,
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(response),
  };
}

/**
 * Create an error response
 */
export function error(
  code: string,
  message: string,
  statusCode: number = 500,
  details?: Record<string, unknown>
): APIGatewayProxyResult {
  const errorObj: ApiError = {
    code,
    message,
    timestamp: new Date().toISOString(),
  };

  if (details) {
    errorObj.details = details;
  }

  const response: ApiResponse = {
    success: false,
    error: errorObj,
    meta: {
      requestId: uuidv4(),
      version: API_VERSION,
    },
  };

  return {
    statusCode,
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(response),
  };
}

/**
 * Create a 400 Bad Request response
 */
export function badRequest(message: string, details?: Record<string, unknown>): APIGatewayProxyResult {
  return error('BAD_REQUEST', message, 400, details);
}

/**
 * Create a 401 Unauthorized response
 */
export function unauthorized(message: string = 'Authentication required'): APIGatewayProxyResult {
  return error('UNAUTHORIZED', message, 401);
}

/**
 * Create a 403 Forbidden response
 */
export function forbidden(message: string = 'Access denied'): APIGatewayProxyResult {
  return error('FORBIDDEN', message, 403);
}

/**
 * Create a 404 Not Found response
 */
export function notFound(message: string = 'Resource not found'): APIGatewayProxyResult {
  return error('NOT_FOUND', message, 404);
}

/**
 * Create a 409 Conflict response
 */
export function conflict(message: string, details?: Record<string, unknown>): APIGatewayProxyResult {
  return error('CONFLICT', message, 409, details);
}

/**
 * Create a 413 Payload Too Large response. Used for storage-quota
 * rejections where the file the client wants to upload would push the
 * tenant over its allowed total.
 */
export function payloadTooLarge(message: string, details?: Record<string, unknown>): APIGatewayProxyResult {
  return error('PAYLOAD_TOO_LARGE', message, 413, details);
}

/**
 * Create a 500 Internal Server Error response
 */
export function internalError(
  message: string = 'An unexpected error occurred'
): APIGatewayProxyResult {
  return error('INTERNAL_ERROR', message, 500);
}

/**
 * Handle errors and return appropriate response
 */
export function handleError(err: unknown): APIGatewayProxyResult {
  console.error('Error:', err);

  if (err instanceof Error) {
    // Check for known error types
    if ('statusCode' in err && typeof (err as { statusCode: unknown }).statusCode === 'number') {
      const statusCode = (err as { statusCode: number }).statusCode;
      const code = 'code' in err ? String((err as { code: unknown }).code) : 'ERROR';
      return error(code, err.message, statusCode);
    }

    // Validation errors
    if (err.name === 'ValidationError') {
      return badRequest(err.message);
    }

    return internalError(err.message);
  }

  return internalError('An unexpected error occurred');
}

export const responses = {
  success,
  error,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  payloadTooLarge,
  internalError,
  handleError,
};
