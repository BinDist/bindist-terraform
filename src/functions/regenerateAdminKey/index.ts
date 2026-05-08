/**
 * Regenerate Admin Key Lambda Handler
 * POST /v1/management/admin/regenerate-key
 *
 * Regenerates the admin's own API key. This is a sensitive operation
 * that requires the admin to confirm with their current key.
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
  console.log('Regenerate admin key request');

  try {
    const ctx = getTenantContext(event);
    if (!ctx) {
      return responses.unauthorized('Tenant context not found');
    }

    if (!ctx.isAdmin) {
      return responses.forbidden('Admin access required');
    }

    // Get the current admin customer record
    const customer = await dynamo.getCustomer(ctx.tablePrefix, ctx.customerId);
    if (!customer) {
      return responses.notFound('Admin customer not found');
    }

    if (!customer.isAdmin) {
      return responses.forbidden('Only admin keys can be regenerated with this endpoint');
    }

    const oldApiKeyHash = customer.apiKeyHash;

    // Generate new API key
    const { apiKey, secret, apiKeyHash } = generateApiKey(ctx.tenantId);
    const now = new Date().toISOString();

    // Update customer with new API key hash
    await dynamo.updateCustomer(ctx.tablePrefix, ctx.customerId, {
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
      customerId: ctx.customerId,
      name: customer.name,
      secret,
      createdAt: now,
    };

    await dynamo.putApiKey(ctx.tablePrefix, apiKeyRecord);

    // Record audit event for admin key regeneration
    await recordTenantEvent(ctx.tablePrefix, {
      eventType: AuditEventType.ADMIN_KEY_REGENERATED,
      outcome: 'SUCCESS',
      actor: `user:${ctx.customerId}`,
      tenantId: ctx.tenantId,
      details: {
        customerId: ctx.customerId,
        customerName: customer.name,
      },
    });

    return responses.success({
      customerId: ctx.customerId,
      apiKey,
      apiSecret: secret,
      regeneratedAt: now,
    });
  } catch (error) {
    console.error('Error regenerating admin key:', error);
    return responses.handleError(error);
  }
};
