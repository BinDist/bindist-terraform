/**
 * Lambda Authorizer for API Gateway
 * Validates API keys and returns an IAM policy
 *
 * Supports two modes:
 * - Multi-tenant: When CONTROL_PREFIX is set, expects {tenantUUID}.{secret} format
 * - Single-tenant: When CONTROL_PREFIX is not set, uses direct API key hash lookup
 */

import {
  APIGatewayTokenAuthorizerEvent,
  APIGatewayAuthorizerResult,
  PolicyDocument,
} from 'aws-lambda';
import { createHash } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { Customer } from '../../shared/types/entities.js';
import { TenantStatus } from '../../shared/types/tenantAuth.js';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Check if we're in multi-tenant mode
const CONTROL_PREFIX = process.env.CONTROL_PREFIX;
const TABLE_PREFIX = process.env.TABLE_PREFIX || 'bindist-dev';
const IS_MULTI_TENANT = !!CONTROL_PREFIX;

// UUID v4 regex pattern (for multi-tenant API key parsing)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AuthContext {
  customerId: string;
  customerName: string;
  isAdmin: boolean;
  isFinancialAdmin: boolean;
  tier: string;
  tablePrefix: string;
  // Multi-tenant specific (optional)
  tenantId?: string;
  s3Prefix?: string;
  quotas?: string;
}

interface ApiKeyRecord {
  apiKeyHash: string;
  customerId: string;
  name?: string;
  createdAt: string;
  lastUsedAt?: string;
}

interface Tenant {
  tenantId: string;
  tablePrefix: string;
  s3Prefix: string;
  tier: string;
  status: string;
}

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  console.log('Authorizer invoked', {
    methodArn: event.methodArn,
    mode: IS_MULTI_TENANT ? 'multi-tenant' : 'single-tenant'
  });

  try {
    const apiKey = extractApiKey(event.authorizationToken);

    if (!apiKey) {
      console.log('No API key provided');
      throw new Error('Unauthorized');
    }

    // Validate based on mode
    const authContext = IS_MULTI_TENANT
      ? await validateMultiTenantApiKey(apiKey)
      : await validateSingleTenantApiKey(apiKey);

    if (!authContext) {
      console.log('Invalid API key');
      throw new Error('Unauthorized');
    }

    console.log('Authentication successful', {
      customerId: authContext.customerId,
      isAdmin: authContext.isAdmin,
      isFinancialAdmin: authContext.isFinancialAdmin,
      mode: IS_MULTI_TENANT ? 'multi-tenant' : 'single-tenant',
    });

    // Generate allow policy
    const wildcardResource = buildWildcardResource(event.methodArn);

    const context: Record<string, string> = {
      customerId: authContext.customerId,
      customerName: authContext.customerName,
      isAdmin: authContext.isAdmin ? 'true' : 'false',
      isFinancialAdmin: authContext.isFinancialAdmin ? 'true' : 'false',
      tier: authContext.tier,
      tablePrefix: authContext.tablePrefix,
      tenantId: authContext.tenantId || 'single-tenant',
      s3Prefix: authContext.s3Prefix || authContext.tablePrefix,
    };

    // Add multi-tenant specific context
    if (IS_MULTI_TENANT) {
      context.multiTenant = 'true';
      if (authContext.quotas) context.quotas = authContext.quotas;
    }

    return generatePolicy(authContext.customerId, 'Allow', wildcardResource, context);
  } catch (error) {
    console.error('Authorization failed:', error);
    throw new Error('Unauthorized');
  }
};

/**
 * Single-tenant API key validation
 * Direct hash lookup in api-keys table
 */
async function validateSingleTenantApiKey(apiKey: string): Promise<AuthContext | null> {
  const apiKeyHash = hashApiKey(apiKey);

  // Look up API key
  const apiKeyRecord = await getApiKeyRecord(TABLE_PREFIX, apiKeyHash);
  if (!apiKeyRecord) {
    console.log('API key not found');
    return null;
  }

  // Get customer
  const customer = await getCustomer(TABLE_PREFIX, apiKeyRecord.customerId);
  if (!customer) {
    console.log('Customer not found:', apiKeyRecord.customerId);
    return null;
  }

  if (!customer.isActive) {
    console.log('Customer not active:', customer.customerId);
    return null;
  }

  // Update last used (non-blocking)
  updateApiKeyLastUsed(TABLE_PREFIX, apiKeyHash).catch(() => {});

  return {
    customerId: customer.customerId,
    customerName: customer.name,
    isAdmin: customer.isAdmin || false,
    isFinancialAdmin: customer.isFinancialAdmin || false,
    tier: 'Standard', // Single-tenant doesn't have tiers
    tablePrefix: TABLE_PREFIX,
    // Single-tenant uses same prefix for tenantId and s3Prefix
    tenantId: 'single-tenant',
    s3Prefix: TABLE_PREFIX,
  };
}

/**
 * Multi-tenant API key validation
 * Expects format: {tenantUUID}.{secret}
 */
async function validateMultiTenantApiKey(apiKey: string): Promise<AuthContext | null> {
  // Parse the API key
  const parsed = parseMultiTenantApiKey(apiKey);
  if (!parsed) {
    console.log('Invalid multi-tenant API key format');
    return null;
  }

  // Look up tenant in control plane
  const tenant = await getTenant(parsed.tenantId);
  if (!tenant) {
    console.log('Tenant not found:', parsed.tenantId);
    return null;
  }

  // Check tenant status
  const allowedStatuses: string[] = [
    TenantStatus.ACTIVE,
    TenantStatus.SUSPENDED,
    TenantStatus.ARCHIVING,
    TenantStatus.ARCHIVED,
  ];
  if (!allowedStatuses.includes(tenant.status)) {
    console.log('Tenant in invalid status:', tenant.tenantId, tenant.status);
    return null;
  }

  // Hash the secret and look up in tenant's api-keys table
  const secretHash = hashApiKey(parsed.secret);
  const apiKeyRecord = await getApiKeyRecord(tenant.tablePrefix, secretHash);
  if (!apiKeyRecord) {
    console.log('API key not found in tenant table');
    return null;
  }

  // Get customer
  const customer = await getCustomer(tenant.tablePrefix, apiKeyRecord.customerId);
  if (!customer) {
    console.log('Customer not found:', apiKeyRecord.customerId);
    return null;
  }

  if (!customer.isActive) {
    console.log('Customer not active:', customer.customerId);
    return null;
  }

  // For archived tenants, only allow admin users (either tier)
  if ((tenant.status === TenantStatus.ARCHIVING || tenant.status === TenantStatus.ARCHIVED) && !customer.isAdmin) {
    console.log('Non-admin access denied for archived tenant:', tenant.tenantId);
    return null;
  }

  // Update last used (non-blocking)
  updateApiKeyLastUsed(tenant.tablePrefix, secretHash).catch(() => {});

  return {
    customerId: customer.customerId,
    customerName: customer.name,
    isAdmin: customer.isAdmin || false,
    isFinancialAdmin: customer.isFinancialAdmin || false,
    tier: tenant.tier,
    tablePrefix: tenant.tablePrefix,
    tenantId: tenant.tenantId,
    s3Prefix: tenant.s3Prefix,
    quotas: JSON.stringify(getQuotasForTier(tenant.tier)),
  };
}

/**
 * Parse multi-tenant API key format: {tenantUUID}.{secret}
 */
function parseMultiTenantApiKey(apiKey: string): { tenantId: string; secret: string } | null {
  const dotIndex = apiKey.indexOf('.');
  if (dotIndex === -1) return null;

  const tenantId = apiKey.substring(0, dotIndex);
  const secret = apiKey.substring(dotIndex + 1);

  if (!UUID_REGEX.test(tenantId)) return null;
  if (!secret || secret.length < 20) return null;

  return { tenantId, secret };
}

/**
 * Hash an API key using SHA-256
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Get tenant from control plane
 */
async function getTenant(tenantId: string): Promise<Tenant | null> {
  const tableName = `${CONTROL_PREFIX}-tenants`;
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { tenantId },
      })
    );
    return (result.Item as Tenant) || null;
  } catch (error) {
    console.error('Error getting tenant:', error);
    return null;
  }
}

/**
 * Get API key record
 */
async function getApiKeyRecord(tablePrefix: string, apiKeyHash: string): Promise<ApiKeyRecord | null> {
  const tableName = `${tablePrefix}-api-keys`;
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { apiKeyHash },
      })
    );
    return (result.Item as ApiKeyRecord) || null;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      console.log(`API keys table not found: ${tableName}`);
    }
    return null;
  }
}

/**
 * Get customer
 */
async function getCustomer(tablePrefix: string, customerId: string): Promise<Customer | null> {
  const tableName = `${tablePrefix}-customers`;
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { customerId },
      })
    );
    return (result.Item as Customer) || null;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      console.log(`Customers table not found: ${tableName}`);
    }
    return null;
  }
}

/**
 * Update API key last used timestamp
 */
async function updateApiKeyLastUsed(tablePrefix: string, apiKeyHash: string): Promise<void> {
  const tableName = `${tablePrefix}-api-keys`;
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { apiKeyHash },
        UpdateExpression: 'SET lastUsedAt = :now',
        ExpressionAttributeValues: {
          ':now': new Date().toISOString(),
        },
      })
    );
  } catch (error) {
    console.warn('Failed to update API key last used:', error);
  }
}

/**
 * Get quotas for tier (multi-tenant only)
 */
function getQuotasForTier(tier: string): Record<string, number> {
  const quotas: Record<string, Record<string, number>> = {
    Trial: { maxApplications: 1, maxStorageGb: 1, maxCustomers: 10 },
    Starter: { maxApplications: 5, maxStorageGb: 10, maxCustomers: 50 },
    Pro: { maxApplications: 0, maxStorageGb: 50, maxCustomers: 0 },
    Enterprise: { maxApplications: 0, maxStorageGb: 0, maxCustomers: 0 },
  };
  return quotas[tier] || quotas.Trial;
}

/**
 * Build wildcard resource ARN for policy
 */
function buildWildcardResource(methodArn: string): string {
  const arnParts = methodArn.split(':');
  const apiGatewayArnParts = arnParts[5].split('/');
  const region = arnParts[3];
  const accountId = arnParts[4];
  const restApiId = apiGatewayArnParts[0];
  const stage = apiGatewayArnParts[1];
  return `arn:aws:execute-api:${region}:${accountId}:${restApiId}/${stage}/*`;
}

/**
 * Extract API key from authorization token
 */
function extractApiKey(authorizationToken: string | undefined): string | null {
  if (!authorizationToken) return null;
  if (authorizationToken.startsWith('Bearer ')) {
    return authorizationToken.substring(7);
  }
  return authorizationToken;
}

/**
 * Generate IAM policy document
 */
function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string>
): APIGatewayAuthorizerResult {
  const policyDocument: PolicyDocument = {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource,
      },
    ],
  };

  const authResponse: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument,
  };

  if (context) {
    authResponse.context = context;
  }

  return authResponse;
}
