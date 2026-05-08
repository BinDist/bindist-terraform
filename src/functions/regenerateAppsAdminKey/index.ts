/**
 * Regenerate Apps Admin Key Lambda Handler
 * POST /v1/management/admin/regenerate-apps-key
 *
 * Financial-admin-only endpoint. Rotates the 'admin-apps' customer's
 * API key so the financial admin can revoke and re-issue the restricted
 * apps-admin key (e.g. when it leaks and the apps-admin operator isn't
 * available to rotate it themselves via /regenerate-key).
 */

import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { generateApiKey } from '../../shared/services/multiTenantAuthService.js';
import { responses } from '../../shared/utils/responses.js';
import { withFinancialAdmin, FinancialAdminHandlerContext } from '../../shared/utils/handlerUtils.js';
import { ApiKey } from '../../shared/types/entities.js';
import { recordTenantEvent } from '../../shared/services/auditService.js';
import { AuditEventType } from '../../shared/types/audit.js';

const APPS_ADMIN_CUSTOMER_ID = 'admin-apps';

async function regenerateAppsAdminKey({ ctx }: FinancialAdminHandlerContext) {
  console.log('Regenerate apps-admin key request', { tenantId: ctx.tenantId });

  const customer = await dynamo.getCustomer(ctx.tablePrefix, APPS_ADMIN_CUSTOMER_ID);
  if (!customer) {
    return responses.notFound(`Apps-admin customer '${APPS_ADMIN_CUSTOMER_ID}' not found`);
  }

  // Sanity check: must be an admin, must NOT be a financial admin
  if (!customer.isAdmin || customer.isFinancialAdmin) {
    return responses.forbidden('Target customer is not the apps-admin');
  }

  const oldApiKeyHash = customer.apiKeyHash;
  const { apiKey, secret, apiKeyHash } = generateApiKey(ctx.tenantId);
  const now = new Date().toISOString();

  await dynamo.updateCustomer(ctx.tablePrefix, APPS_ADMIN_CUSTOMER_ID, {
    apiKeyHash,
    updatedAt: now,
  });

  if (oldApiKeyHash) {
    await dynamo.deleteApiKey(ctx.tablePrefix, oldApiKeyHash);
  }

  const apiKeyRecord: ApiKey = {
    apiKeyHash,
    customerId: APPS_ADMIN_CUSTOMER_ID,
    name: customer.name,
    secret,
    createdAt: now,
  };

  await dynamo.putApiKey(ctx.tablePrefix, apiKeyRecord);

  await recordTenantEvent(ctx.tablePrefix, {
    eventType: AuditEventType.ADMIN_KEY_REGENERATED,
    outcome: 'SUCCESS',
    actor: `user:${ctx.customerId}`,
    tenantId: ctx.tenantId,
    details: {
      customerId: APPS_ADMIN_CUSTOMER_ID,
      customerName: customer.name,
    },
  });

  return responses.success({
    customerId: APPS_ADMIN_CUSTOMER_ID,
    apiKey,
    apiSecret: secret,
    regeneratedAt: now,
  });
}

export const handler = withFinancialAdmin(regenerateAppsAdminKey);
