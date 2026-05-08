/**
 * Update Customer Lambda Handler
 * PATCH /v1/management/customers/{customerId}
 *
 * Updates customer properties (enable/disable, name, notes)
 */

import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { checkCustomerQuota } from '../../shared/services/quotaEnforcementService.js';
import { responses } from '../../shared/utils/responses.js';
import { withAdminAndBody, AdminHandlerContextWithBody } from '../../shared/utils/handlerUtils.js';
import { UpdateCustomerRequest } from '../../shared/types/api.js';
import { recordTenantEvent } from '../../shared/services/auditService.js';
import { AuditEventType } from '../../shared/types/audit.js';

async function updateCustomerHandler({ event, ctx, body }: AdminHandlerContextWithBody<UpdateCustomerRequest>) {
  const customerId = event.pathParameters?.customerId;

  console.log('Update customer request', { customerId });

  if (!customerId) {
    return responses.badRequest('Customer ID is required');
  }

  // Get existing customer
  const customer = await dynamo.getCustomer(ctx.tablePrefix, customerId);
  if (!customer) {
    return responses.notFound(`Customer '${customerId}' not found`);
  }

  // Prevent updating admin customers
  if (customer.isAdmin) {
    return responses.forbidden('Cannot modify admin customers');
  }

  // Check quota when enabling a disabled customer
  if (body.isActive === true && !customer.isActive) {
    const quotaCheck = await checkCustomerQuota(ctx, customerId);
    if (!quotaCheck.allowed) {
      return responses.forbidden(quotaCheck.message);
    }
  }

  // Build updates
  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.isActive !== undefined) {
    updates.isActive = body.isActive;
  }

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return responses.badRequest('Name cannot be empty');
    }
    updates.name = body.name.trim();
  }

  if (body.notes !== undefined) {
    updates.notes = body.notes;
  }

  if (body.email !== undefined) {
    const trimmed = body.email.trim();
    if (trimmed && (trimmed.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))) {
      return responses.badRequest('Invalid email');
    }
    updates.email = trimmed;
  }

  if (body.reference !== undefined) {
    const trimmed = body.reference.trim();
    if (trimmed.length > 200) {
      return responses.badRequest('Reference too long (max 200 chars)');
    }
    updates.reference = trimmed;
  }

  if (body.license !== undefined) {
    const trimmed = body.license.trim();
    if (trimmed.length > 500) {
      return responses.badRequest('License too long (max 500 chars)');
    }
    updates.license = trimmed;
  }

  // Update customer
  await dynamo.updateCustomer(ctx.tablePrefix, customerId, updates);

  // Record audit event if isActive changed
  if (body.isActive !== undefined && body.isActive !== customer.isActive) {
    await recordTenantEvent(ctx.tablePrefix, {
      eventType: body.isActive ? AuditEventType.CUSTOMER_ENABLED : AuditEventType.CUSTOMER_DISABLED,
      outcome: 'SUCCESS',
      actor: `user:${ctx.customerId}`,
      tenantId: ctx.tenantId,
      details: {
        customerId,
        customerName: customer.name,
      },
    });
  }

  // Return updated customer
  const updatedCustomer = await dynamo.getCustomer(ctx.tablePrefix, customerId);

  if (!updatedCustomer) {
    return responses.internalError('Failed to retrieve updated customer');
  }

  return responses.success({
    customerId: updatedCustomer.customerId,
    name: updatedCustomer.name,
    isActive: updatedCustomer.isActive,
    notes: updatedCustomer.notes,
    email: updatedCustomer.email,
    reference: updatedCustomer.reference,
    license: updatedCustomer.license,
    updatedAt: updatedCustomer.updatedAt,
  });
}

export const handler = withAdminAndBody(updateCustomerHandler);
