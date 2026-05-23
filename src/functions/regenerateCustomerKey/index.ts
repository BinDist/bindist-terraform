/**
 * Regenerate Customer Key Lambda Handler
 * POST /v1/management/customers/{customerId}/regenerate-key
 *
 * Regenerates the API secret for a customer
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { generateApiKey } from '../../shared/services/multiTenantAuthService.js';
import { responses } from '../../shared/utils/responses.js';
import { getTenantContext } from '../../shared/utils/tenantContext.js';
import { ApiKey } from '../../shared/types/entities.js';
import { recordTenantEvent } from '../../shared/services/auditService.js';
import { AuditEventType } from '../../shared/types/audit.js';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const customerId = event.pathParameters?.customerId;

  try {
    const ctx = getTenantContext(event);
    if (!ctx) {
      return responses.unauthorized('Tenant context not found');
    }

    if (!ctx.isAdmin) {
      return responses.forbidden('Admin access required');
    }

    if (!customerId) {
      return responses.badRequest('Customer ID is required');
    }

    // Get existing customer
    const customer = await dynamo.getCustomer(ctx.tablePrefix, customerId);
    if (!customer) {
      return responses.notFound(`Customer '${customerId}' not found`);
    }

    // Prevent regenerating admin keys
    if (customer.isAdmin) {
      return responses.forbidden('Cannot regenerate admin API keys');
    }

    const oldApiKeyHash = customer.apiKeyHash;

    // Generate new API key
    const { apiKey, secret, apiKeyHash } = generateApiKey(ctx.tenantId);
    const now = new Date().toISOString();

    // Update customer with new API key hash
    await dynamo.updateCustomer(ctx.tablePrefix, customerId, {
      apiKeyHash,
      updatedAt: now,
    });

    // Delete old API key lookup record
    if (oldApiKeyHash) {
      await dynamo.deleteApiKey(ctx.tablePrefix, oldApiKeyHash);
    }

    // Create new API key fast lookup record
    const apiKeyRecord: ApiKey = {
      apiKeyHash,
      customerId,
      name: customer.name,
      secret,
      createdAt: now,
    };

    await dynamo.putApiKey(ctx.tablePrefix, apiKeyRecord);

    // Record audit event for key regeneration
    await recordTenantEvent(ctx.tablePrefix, {
      eventType: AuditEventType.CUSTOMER_KEY_REGENERATED,
      outcome: 'SUCCESS',
      actor: `user:${ctx.customerId}`,
      tenantId: ctx.tenantId,
      details: {
        customerId,
        customerName: customer.name,
      },
    });

    return responses.success({
      customerId,
      apiKey,
      apiSecret: secret,
      regeneratedAt: now,
    });
  } catch (error) {
    console.error('Error regenerating customer key:', error);
    return responses.handleError(error);
  }
};
