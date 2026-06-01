import * as crypto from 'crypto';
import { getPgPool } from '../../src/shared/data/dynamodb.js';

interface AuthorizerContext {
  tenantId: string;
  tablePrefix: string;
  s3Prefix: string;
  customerId: string;
  isAdmin: string;
  isFinancialAdmin: string;
  tier: string;
  quotas: string;
}

/**
 * Authenticate an incoming request by validating the Bearer token.
 *
 * Hashes the token with SHA-256 and looks it up in the api_keys table,
 * then verifies the associated customer is active.
 */
export async function authenticateRequest(
  headers: Record<string, string>
): Promise<AuthorizerContext | null> {
  const authHeader =
    headers['Authorization'] || headers['authorization'] || '';

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return null;
  }

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const tablePrefix = process.env.TABLE_PREFIX || '';
  const tenantId = tablePrefix.replace(/-$/, '');

  // Single-tenant is the customer's own dedicated deployment: no quotas.
  // Emit the canonical TenantQuotas shape (GB + counts, 0 = unlimited) that
  // quotaEnforcementService reads — not a bespoke maxStorageBytes/maxFileSize
  // shape. The 0s resolve to "unlimited" via each check's `0 means unlimited`
  // branch, making the no-limit behaviour deliberate rather than a field-name
  // mismatch.
  const quotas = JSON.stringify({
    maxStorageGb: 0,
    maxApplications: 0,
    maxCustomers: 0,
  });

  // Look up API key in database
  try {
    const pool = await getPgPool();
    const keyResult = await pool.query(
      'SELECT "customerId" FROM api_keys WHERE "apiKeyHash" = $1',
      [hash]
    );

    if (keyResult.rows.length > 0) {
      const customerId = keyResult.rows[0].customerId;

      // Get customer and check isActive
      const custResult = await pool.query(
        'SELECT "customerId", "isAdmin", "isFinancialAdmin", "isActive" FROM customers WHERE "customerId" = $1',
        [customerId]
      );

      if (custResult.rows.length > 0 && custResult.rows[0].isActive) {
        const customer = custResult.rows[0];

        // Update lastUsedAt (non-blocking)
        pool.query(
          'UPDATE api_keys SET "lastUsedAt" = $1 WHERE "apiKeyHash" = $2',
          [new Date().toISOString(), hash]
        ).catch(() => {});

        return {
          tenantId,
          tablePrefix,
          s3Prefix: tenantId,
          customerId: customer.customerId,
          isAdmin: customer.isAdmin ? 'true' : 'false',
          isFinancialAdmin: customer.isFinancialAdmin ? 'true' : 'false',
          tier: 'Standard',
          quotas,
        };
      }
    }
  } catch (err) {
    console.error('DB auth lookup failed:', err);
  }

  return null;
}
