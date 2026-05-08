/**
 * Multi-Tenant Authentication Service
 * API key generation and management for the {tenantUUID}.{secret} format.
 *
 * Authentication/validation is handled by the authorizer (AWS) or
 * auth-middleware (Scaleway) — this service provides key generation and
 * storage only.
 */

import { createHash, randomBytes } from 'crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { TenantApiKey } from '../types/tenantAuth.js';
import { getDocumentClient } from '../data/dynamodb.js';

const sendCommand = async (cmd: any) => (await getDocumentClient()).send(cmd);

/**
 * Hash the secret part of an API key
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Generate a new API key for a tenant
 * Returns:
 * - apiKey: Full API key in format {tenantId}.{secret} (returned to user)
 * - secret: Just the secret part (stored in DB for retrieval)
 * - apiKeyHash: SHA-256 hash of secret (used for authentication)
 */
export function generateApiKey(tenantId: string): { apiKey: string; secret: string; apiKeyHash: string } {
  // Generate 32 bytes of randomness
  const secretBytes = randomBytes(32);
  const secret = secretBytes.toString('base64url');

  // Combine with tenant ID
  const apiKey = `${tenantId}.${secret}`;

  // Hash only the secret part
  const apiKeyHash = hashSecret(secret);

  return { apiKey, secret, apiKeyHash };
}

/**
 * Create an API key record in a tenant's api-keys table
 */
export async function createTenantApiKeyWithTenantId(
  tenantId: string,
  tablePrefix: string,
  customerId: string,
  name?: string
): Promise<{ apiKey: string; record: TenantApiKey }> {
  const { apiKey, apiKeyHash } = generateApiKey(tenantId);

  const record: TenantApiKey = {
    apiKeyHash,
    customerId,
    name,
    createdAt: new Date().toISOString(),
  };

  await sendCommand(
    new PutCommand({
      TableName: `${tablePrefix}-api-keys`,
      Item: record,
    })
  );

  return { apiKey, record };
}

/**
 * Authentication error
 */
export class AuthenticationError extends Error {
  readonly code = 'UNAUTHORIZED';
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends Error {
  readonly code = 'FORBIDDEN';
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Tenant not found/inactive error
 */
export class TenantError extends Error {
  readonly code = 'TENANT_ERROR';
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = 'TenantError';
  }
}

export const multiTenantAuthService = {
  hashSecret,
  generateApiKey,
  createTenantApiKeyWithTenantId,
  AuthenticationError,
  AuthorizationError,
  TenantError,
};
