/**
 * Create API Key Lambda Handler
 * POST /v1/management/customers/{customerId}/apikeys
 *
 * Creates a new API key for end-user access (sub-customer)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { generateApiKey } from '../../shared/services/multiTenantAuthService.js';
import { checkCustomerQuota } from '../../shared/services/quotaEnforcementService.js';
import { responses } from '../../shared/utils/responses.js';
import { validate, validation } from '../../shared/utils/validation.js';
import { getTenantContext } from '../../shared/utils/tenantContext.js';
import { Customer, ApiKey } from '../../shared/types/entities.js';
import { CreateApiKeyResponse } from '../../shared/types/api.js';
import { recordTenantEvent } from '../../shared/services/auditService.js';
import { AuditEventType } from '../../shared/types/audit.js';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const targetCustomerId = event.pathParameters?.customerId;

  try {
    const ctx = getTenantContext(event);
    if (!ctx) {
      return responses.unauthorized('Tenant context not found');
    }

    if (!ctx.isAdmin) {
      return responses.forbidden('Admin access required to create API keys');
    }

    if (!targetCustomerId) {
      return responses.badRequest('Customer ID is required');
    }

    if (!event.body) {
      return responses.badRequest('Request body is required');
    }

    const body = JSON.parse(event.body) as Record<string, unknown>;

    const request = validate<{
      name: string;
      notes?: string;
      email?: string;
      reference?: string;
      license?: string;
    }>(validation.createApiKeyRequestSchema, body);

    const { name, notes, email, reference, license } = request;

    // Check customer quota
    const quotaCheck = await checkCustomerQuota(ctx);
    if (!quotaCheck.allowed) {
      return responses.forbidden(quotaCheck.message);
    }

    // Verify parent customer exists
    const parentCustomer = await dynamo.getCustomer(ctx.tablePrefix, targetCustomerId);
    if (!parentCustomer) {
      return responses.notFound(`Customer '${targetCustomerId}' not found`);
    }

    // Generate new API key
    const isMultiTenant = !!process.env.CONTROL_PREFIX;
    const generated = generateApiKey(ctx.tenantId);
    const apiKey = isMultiTenant ? generated.apiKey : generated.secret;
    const { secret, apiKeyHash } = generated;

    // Create new customer ID
    const newCustomerId = uuidv4();
    const now = new Date().toISOString();

    // Create sub-customer record
    const newCustomer: Customer = {
      customerId: newCustomerId,
      name,
      apiKeyHash,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      notes,
      email,
      reference,
      license,
      parentCustomerId: targetCustomerId,
    };

    await dynamo.putCustomer(ctx.tablePrefix, newCustomer);

    // Create API key fast lookup record (store secret for admin retrieval)
    const apiKeyRecord: ApiKey = {
      apiKeyHash,
      customerId: newCustomerId,
      name,
      secret,
      createdAt: now,
    };

    await dynamo.putApiKey(ctx.tablePrefix, apiKeyRecord);

    // Record audit event for customer creation
    await recordTenantEvent(ctx.tablePrefix, {
      eventType: AuditEventType.CUSTOMER_CREATED,
      outcome: 'SUCCESS',
      actor: `user:${ctx.customerId}`,
      tenantId: ctx.tenantId,
      details: {
        customerId: newCustomerId,
        customerName: name,
      },
    });

    const response: CreateApiKeyResponse = {
      customerId: newCustomerId,
      apiKey,
      name,
      createdAt: now,
    };

    return responses.success(response, 201);
  } catch (error) {
    console.error('Error creating API key:', error);
    return responses.handleError(error);
  }
};
