/**
 * Delete Application Lambda Handler
 * DELETE /v1/management/applications/{applicationId}
 *
 * Performs a soft delete by setting deletedAt timestamp.
 * The application and its data remain in the database but are hidden from listings.
 */

import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { responses } from '../../shared/utils/responses.js';
import { withAdmin, AdminHandlerContext } from '../../shared/utils/handlerUtils.js';
import { recordTenantEvent } from '../../shared/services/auditService.js';
import { AuditEventType } from '../../shared/types/audit.js';

async function deleteApplicationHandler({ event, ctx }: AdminHandlerContext) {
  const applicationId = event.pathParameters?.applicationId;

  console.log('Delete application request', { applicationId });

  if (!applicationId) {
    return responses.badRequest('Application ID is required');
  }

  // Get the application (including deleted ones to provide better error messages)
  const application = await dynamo.getApplication(ctx.tablePrefix, applicationId, { includeDeleted: true });

  if (!application) {
    return responses.notFound(`Application '${applicationId}' not found`);
  }

  if (application.deletedAt) {
    return responses.badRequest(`Application '${applicationId}' is already deleted`);
  }

  // Perform soft delete
  const deletedApplication = await dynamo.softDeleteApplication(ctx.tablePrefix, applicationId);

  // Record audit event for application deletion
  await recordTenantEvent(ctx.tablePrefix, {
    eventType: AuditEventType.APPLICATION_DELETED,
    outcome: 'SUCCESS',
    actor: `user:${ctx.customerId}`,
    tenantId: ctx.tenantId,
    details: {
      applicationId,
      applicationName: application.name,
    },
  });

  console.log('Application soft deleted', {
    applicationId,
    deletedAt: deletedApplication.deletedAt,
  });

  return responses.success({
    message: `Application '${applicationId}' has been deleted`,
    applicationId,
    deletedAt: deletedApplication.deletedAt,
  });
}

export const handler = withAdmin(deleteApplicationHandler);
