/**
 * Complete Large Upload Lambda Handler
 * POST /v1/management/upload/large-complete
 *
 * Called after the file has been uploaded directly to S3
 * Creates the version and file records in DynamoDB
 */

import { v4 as uuidv4 } from 'uuid';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { emitIpChangeAlert } from '../../shared/services/uploadAlertEmitter.js';
import { responses } from '../../shared/utils/responses.js';
import { validate, validation } from '../../shared/utils/validation.js';
import { detectFileType } from '../../shared/utils/fileUtils.js';
import { withAdminAndBody, AdminHandlerContextWithBody } from '../../shared/utils/handlerUtils.js';
import { Version, ApplicationFile } from '../../shared/types/entities.js';
import { CompleteLargeUploadRequest } from '../../shared/types/api.js';

async function completeLargeUploadHandler({ event, ctx, body }: AdminHandlerContextWithBody<unknown>) {
  console.log('Complete large upload request');

  // Validate request
  const request = validate<CompleteLargeUploadRequest>(validation.completeLargeUploadRequestSchema, body);

  const {
    uploadId,
    applicationId,
    version,
    fileName,
    fileSize,
    checksum,
    releaseNotes,
  } = request;

  // Verify application exists
  const application = await dynamo.getApplication(ctx.tablePrefix, applicationId);

  if (!application) {
    return responses.notFound(`Application '${applicationId}' not found`);
  }

  // File was uploaded directly to S3 via pre-signed URL
  // Trust the client's completion request - if file doesn't exist, download will fail later

  // Create version record
  const versionId = `${applicationId}-${version}`;
  const now = new Date().toISOString();

  const versionRecord: Version = {
    applicationId,
    version,
    versionId,
    releaseNotes,
    isActive: true,
    isEnabled: false, // Disabled by default until manually enabled by admin
    createdAt: now,
    updatedAt: now,
    fileSize,
    checksum,
    downloadCount: 0,
  };

  await dynamo.putVersion(ctx.tablePrefix, versionRecord);

  // Create application file record
  const fileType = detectFileType(fileName);
  const appFile: ApplicationFile = {
    versionId,
    fileId: uploadId,
    fileName,
    fileType,
    fileSize,
    checksum,
    order: 1,
    createdAt: now,
  };

  await dynamo.putApplicationFile(ctx.tablePrefix, appFile);

  // Record the upload event
  const clientIp = event.requestContext.identity?.sourceIp || 'unknown';
  const userAgent = event.headers['User-Agent'] || event.headers['user-agent'];

  const uploadRecord = await dynamo.recordUpload(ctx.tablePrefix, {
    applicationId,
    uploadId: uuidv4(),
    customerId: ctx.customerId,
    versionId,
    version,
    fileId: uploadId,
    fileName,
    fileSize,
    checksum,
    fileType,
    clientIp,
    userAgent,
    uploadedAt: now,
    uploadMethod: 'large',
  });

  if (uploadRecord.ipChanged) {
    await emitIpChangeAlert(ctx.tenantId, uploadRecord);
  }

  // Update application's latest version
  await dynamo.putApplication(ctx.tablePrefix, {
    ...application,
    latestVersion: version,
    updatedAt: now,
  });

  return responses.success({
    message: 'Version created successfully',
    versionId,
    applicationId,
    version,
    fileSize,
    checksum,
  }, 201);
}

export const handler = withAdminAndBody(completeLargeUploadHandler);
