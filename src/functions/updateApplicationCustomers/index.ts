/**
 * Update Application Customers Lambda Handler
 * PUT /v1/management/applications/{applicationId}/customers
 *
 * Add or remove customers from an application
 */

import Joi from 'joi';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { responses } from '../../shared/utils/responses.js';
import { validate } from '../../shared/utils/validation.js';
import { withAdminAndBody, AdminHandlerContextWithBody } from '../../shared/utils/handlerUtils.js';
import { UpdateApplicationCustomersRequest } from '../../shared/types/api.js';
import { recordTenantEvent } from '../../shared/services/auditService.js';
import { AuditEventType } from '../../shared/types/audit.js';

const updateCustomersSchema = Joi.object({
  addCustomerIds: Joi.array().items(
    Joi.string().min(1).max(100)
  ).default([]),
  removeCustomerIds: Joi.array().items(
    Joi.string().min(1).max(100)
  ).default([]),
});

async function updateApplicationCustomersHandler({ event, ctx, body }: AdminHandlerContextWithBody<unknown>) {
  const applicationId = event.pathParameters?.applicationId;

  console.log('Update application customers request', { applicationId });

  if (!applicationId) {
    return responses.badRequest('Application ID is required');
  }

  const validated = validate<UpdateApplicationCustomersRequest>(updateCustomersSchema, body);

  const { addCustomerIds, removeCustomerIds } = validated;

  if (addCustomerIds.length === 0 && removeCustomerIds.length === 0) {
    return responses.badRequest('Must specify addCustomerIds or removeCustomerIds');
  }

  // Check for overlap
  const overlap = addCustomerIds.filter(id => removeCustomerIds.includes(id));
  if (overlap.length > 0) {
    return responses.badRequest(`Customer IDs cannot be in both add and remove: ${overlap.join(', ')}`);
  }

  // Find existing application
  const existingApp = await dynamo.getApplication(ctx.tablePrefix, applicationId);
  if (!existingApp) {
    return responses.notFound(`Application '${applicationId}' not found`);
  }

  // Verify customers to add exist and are not admins
  const addedCustomers: { id: string; name: string }[] = [];
  if (addCustomerIds.length > 0) {
    const customerChecks = await Promise.all(
      addCustomerIds.map(cid => dynamo.getCustomer(ctx.tablePrefix, cid))
    );

    const notFoundCustomers = addCustomerIds.filter((_, idx) => customerChecks[idx] === null);
    if (notFoundCustomers.length > 0) {
      return responses.badRequest(`Customer(s) not found: ${notFoundCustomers.join(', ')}`);
    }

    const adminCustomers = addCustomerIds.filter((_, idx) => customerChecks[idx]?.isAdmin === true);
    if (adminCustomers.length > 0) {
      return responses.badRequest(`Cannot assign applications to admin customer(s): ${adminCustomers.join(', ')}`);
    }

    // Check which customers already have access
    const existingChecks = await Promise.all(
      addCustomerIds.map(cid => dynamo.hasApplicationAccess(ctx.tablePrefix, cid, applicationId))
    );

    // Only add for customers that don't already have access
    const customersToAdd = addCustomerIds.filter((_, idx) => !existingChecks[idx]);

    if (customersToAdd.length > 0) {
      await Promise.all(
        customersToAdd.map(cid =>
          dynamo.grantApplicationAccess(ctx.tablePrefix, cid, applicationId, ctx.customerId)
        )
      );
      // Track added customers for audit
      customersToAdd.forEach((cid, _idx) => {
        const customerIdx = addCustomerIds.indexOf(cid);
        addedCustomers.push({ id: cid, name: customerChecks[customerIdx]?.name || cid });
      });
    }
  }

  // Remove customers
  const removedCustomers: { id: string; name: string }[] = [];
  if (removeCustomerIds.length > 0) {
    // Get customer names for audit before removing
    const removeCustomerChecks = await Promise.all(
      removeCustomerIds.map(cid => dynamo.getCustomer(ctx.tablePrefix, cid))
    );

    await Promise.all(
      removeCustomerIds.map(cid =>
        dynamo.revokeApplicationAccess(ctx.tablePrefix, cid, applicationId)
      )
    );

    // Track removed customers for audit
    removeCustomerIds.forEach((cid, idx) => {
      removedCustomers.push({ id: cid, name: removeCustomerChecks[idx]?.name || cid });
    });
  }

  // Record audit events for each link/unlink
  for (const customer of addedCustomers) {
    await recordTenantEvent(ctx.tablePrefix, {
      eventType: AuditEventType.CUSTOMER_APP_LINKED,
      outcome: 'SUCCESS',
      actor: `user:${ctx.customerId}`,
      tenantId: ctx.tenantId,
      details: {
        customerId: customer.id,
        customerName: customer.name,
        applicationId,
        applicationName: existingApp.name,
      },
    });
  }

  for (const customer of removedCustomers) {
    await recordTenantEvent(ctx.tablePrefix, {
      eventType: AuditEventType.CUSTOMER_APP_UNLINKED,
      outcome: 'SUCCESS',
      actor: `user:${ctx.customerId}`,
      tenantId: ctx.tenantId,
      details: {
        customerId: customer.id,
        customerName: customer.name,
        applicationId,
        applicationName: existingApp.name,
      },
    });
  }

  // Get updated list of customers for this application
  const appCustomers = await dynamo.getApplicationCustomers(ctx.tablePrefix, applicationId);
  const customerIds = appCustomers.map(ca => ca.customerId);

  return responses.success({
    applicationId,
    customerIds,
    added: addCustomerIds,
    removed: removeCustomerIds,
  });
}

export const handler = withAdminAndBody(updateApplicationCustomersHandler);
