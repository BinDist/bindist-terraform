/**
 * Upload Binary Lambda Handler
 * POST /v1/management/upload
 *
 * Handles direct binary uploads (for smaller files)
 * For large files, use getLargeUploadUrl + completeLargeUpload
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import * as s3 from '../../shared/services/multiTenantS3Service.js';
import { emitIpChangeAlert } from '../../shared/services/uploadAlertEmitter.js';
import { responses } from '../../shared/utils/responses.js';
import { validate, validation } from '../../shared/utils/validation.js';
import { getApplicationsBucket } from '../../shared/utils/tenantContext.js';
import { withAdminAndBody, AdminHandlerContextWithBody } from '../../shared/utils/handlerUtils.js';
import { Version, ApplicationFile } from '../../shared/types/entities.js';
import { UploadBinaryRequest } from '../../shared/types/api.js';

async function uploadBinaryHandler({ event, ctx, body }: AdminHandlerContextWithBody<unknown>) {
  console.log('Upload binary request');

  const request = validate<UploadBinaryRequest>(validation.uploadRequestSchema, body);

  const {
    applicationId,
    version,
    releaseNotes,
    fileName,
    fileType,
    description,
    fileContent,
  } = request;

  // Verify application exists
  const application = await dynamo.getApplication(ctx.tablePrefix, applicationId);
  if (!application) {
    return responses.notFound(`Application '${applicationId}' not found`);
  }

  // Check if version already exists
  const existingVersion = await dynamo.getVersion(ctx.tablePrefix, applicationId, version);
  if (existingVersion) {
    return responses.conflict(`Version '${version}' already exists for application '${applicationId}'`);
  }

  const bucketName = getApplicationsBucket(ctx);
  let fileSize = 0;
  let checksum = '';

  // If file content is provided, upload to S3
  if (fileContent) {
    const fileBuffer = Buffer.from(fileContent, 'base64');
    fileSize = fileBuffer.length;
    checksum = createHash('sha256').update(fileBuffer).digest('hex');

    const fileId = uuidv4();
    const versionId = `${applicationId}-${version}`;

    // Upload to S3
    await s3.uploadFile(
      bucketName,
      applicationId,
      version,
      fileName,
      fileBuffer,
      'application/octet-stream',
      fileId
    );

    // Create application file record
    const appFile: ApplicationFile = {
      versionId,
      fileId,
      fileName,
      fileType,
      fileSize,
      checksum,
      order: 1,
      description,
      createdAt: new Date().toISOString(),
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
      fileId,
      fileName,
      fileSize,
      checksum,
      fileType,
      clientIp,
      userAgent,
      uploadedAt: new Date().toISOString(),
      uploadMethod: 'direct',
    });

    if (uploadRecord.ipChanged) {
      await emitIpChangeAlert(ctx.tenantId, uploadRecord);
    }
  }

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

export const handler = withAdminAndBody(uploadBinaryHandler);
