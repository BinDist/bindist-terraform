/**
 * Update Version Lambda Handler
 * PATCH /v1/management/applications/{applicationId}/versions/{version}
 */

import Joi from 'joi';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { responses } from '../../shared/utils/responses.js';
import { validate } from '../../shared/utils/validation.js';
import { withAdminAndBody, AdminHandlerContextWithBody } from '../../shared/utils/handlerUtils.js';
import { UpdateVersionRequest } from '../../shared/types/api.js';

const updateVersionSchema = Joi.object({
  releaseNotes: Joi.string().max(5000).trim().allow('', null),
  isActive: Joi.boolean(),
  isEnabled: Joi.boolean(),
});

async function updateVersionHandler({ event, ctx, body }: AdminHandlerContextWithBody<unknown>) {
  const applicationId = event.pathParameters?.applicationId;
  const version = event.pathParameters?.version;

  if (!applicationId) {
    return responses.badRequest('Application ID is required');
  }

  if (!version) {
    return responses.badRequest('Version is required');
  }

  // Validate request body
  const request = validate<UpdateVersionRequest>(updateVersionSchema, body);

  // Check if there's anything to update
  if (
    request.releaseNotes === undefined &&
    request.isActive === undefined &&
    request.isEnabled === undefined
  ) {
    return responses.badRequest('No update fields provided');
  }

  // Get existing version
  const existingVersion = await dynamo.getVersion(
    ctx.tablePrefix,
    applicationId,
    version
  );

  if (!existingVersion) {
    return responses.notFound(`Version '${version}' not found for application '${applicationId}'`);
  }

  // Apply updates
  const now = new Date().toISOString();
  const updatedVersion = {
    ...existingVersion,
    updatedAt: now,
  };

  if (request.releaseNotes !== undefined) {
    // Allow setting to empty string or null to clear release notes
    updatedVersion.releaseNotes = request.releaseNotes || undefined;
  }

  if (request.isActive !== undefined) {
    updatedVersion.isActive = request.isActive;
  }

  if (request.isEnabled !== undefined) {
    updatedVersion.isEnabled = request.isEnabled;
  }

  // Save updated version
  await dynamo.putVersion(ctx.tablePrefix, updatedVersion);

  return responses.success({
    message: 'Version updated successfully',
    applicationId,
    version,
    releaseNotes: updatedVersion.releaseNotes,
    isActive: updatedVersion.isActive,
    isEnabled: updatedVersion.isEnabled,
    updatedAt: updatedVersion.updatedAt,
  });
}

export const handler = withAdminAndBody(updateVersionHandler);
