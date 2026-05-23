/**
 * Create Application Lambda Handler
 * POST /v1/management/applications
 */

import Joi from 'joi';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { checkApplicationQuota } from '../../shared/services/quotaEnforcementService.js';
import { responses } from '../../shared/utils/responses.js';
import { validate } from '../../shared/utils/validation.js';
import { withAdminAndBody, AdminHandlerContextWithBody } from '../../shared/utils/handlerUtils.js';
import { Application } from '../../shared/types/entities.js';
import { CreateApplicationRequest } from '../../shared/types/api.js';
import { recordTenantEvent } from '../../shared/services/auditService.js';
import { AuditEventType } from '../../shared/types/audit.js';

/**
 * Request body validation schema
 */
const createApplicationSchema = Joi.object({
  customerIds: Joi.array().items(
    Joi.string().min(1).max(100).pattern(/^[a-zA-Z0-9_-]+$/)
  ).default([]),
  applicationId: Joi.string().min(1).max(100).pattern(/^[a-zA-Z0-9_-]+$/).required(),
  name: Joi.string().min(1).max(200).trim().required(),
  description: Joi.string().max(2000).trim().allow(''),
  tags: Joi.array().items(Joi.string().min(1).max(50)).max(20),
});

async function createApplicationHandler({ ctx, body }: AdminHandlerContextWithBody<unknown>) {
  const validated = validate<CreateApplicationRequest>(createApplicationSchema, body);
  const customerIds = validated.customerIds || [];

  // Reject if an application with this ID already exists, including soft-deleted ones.
  // Why: a PutCommand-based upsert behaves differently across providers (DynamoDB fully
  // replaces the item, the Scaleway SQL adapter only updates columns present in the Item),
  // and even on AWS a clobber silently inherits prior versions, files, S3 binaries, and
  // access grants. A hard conflict is the only safe, consistent behavior.
  const existingApp = await dynamo.getApplication(ctx.tablePrefix, validated.applicationId, {
    includeDeleted: true,
  });
  if (existingApp) {
    const message = existingApp.deletedAt
      ? `Application '${validated.applicationId}' was previously deleted; IDs cannot be reused`
      : `Application '${validated.applicationId}' already exists`;
    return responses.conflict(message);
  }

  const quotaCheck = await checkApplicationQuota(ctx, true);
  if (!quotaCheck.allowed) {
    return responses.forbidden(quotaCheck.message);
  }

  // Verify all target customers exist and are not admins (only if customers specified)
  if (customerIds.length > 0) {
    const customerChecks = await Promise.all(
      customerIds.map(cid => dynamo.getCustomer(ctx.tablePrefix, cid))
    );
    const notFoundCustomers = customerIds.filter((_, idx) => customerChecks[idx] === null);
    if (notFoundCustomers.length > 0) {
      return responses.badRequest(
        `Customer(s) not found: ${notFoundCustomers.join(', ')}`
      );
    }
    const adminCustomers = customerIds.filter((_, idx) => customerChecks[idx]?.isAdmin === true);
    if (adminCustomers.length > 0) {
      return responses.badRequest(
        `Cannot assign applications to admin customer(s): ${adminCustomers.join(', ')}`
      );
    }
  }

  const now = new Date().toISOString();

  const application: Application = {
    applicationId: validated.applicationId,
    name: validated.name,
    description: validated.description || '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    tags: validated.tags || [],
  };
  await dynamo.putApplication(ctx.tablePrefix, application);

  await recordTenantEvent(ctx.tablePrefix, {
    eventType: AuditEventType.APPLICATION_CREATED,
    outcome: 'SUCCESS',
    actor: `user:${ctx.customerId}`,
    tenantId: ctx.tenantId,
    details: {
      applicationId: validated.applicationId,
      applicationName: validated.name,
    },
  });

  if (customerIds.length > 0) {
    await Promise.all(
      customerIds.map(cid =>
        dynamo.grantApplicationAccess(ctx.tablePrefix, cid, validated.applicationId, ctx.customerId)
      )
    );
  }

  const responseData = {
    applicationId: validated.applicationId,
    name: validated.name,
    description: validated.description || '',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    tags: validated.tags || [],
    customerIds,
  };

  return responses.success(responseData, 201);
}

export const handler = withAdminAndBody(createApplicationHandler);
