/**
 * Get Large Upload URL Lambda Handler
 * POST /v1/management/upload/large-url
 *
 * Returns a pre-signed URL for uploading large files directly to S3
 */

import { v4 as uuidv4 } from 'uuid';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import * as s3 from '../../shared/services/multiTenantS3Service.js';
import { checkStorageQuota } from '../../shared/services/quotaEnforcementService.js';
import { recordTenantEvent, extractClientContext } from '../../shared/services/auditService.js';
import { responses } from '../../shared/utils/responses.js';
import { validate, validation } from '../../shared/utils/validation.js';
import { getApplicationsBucket } from '../../shared/utils/tenantContext.js';
import { withAdminAndBody, AdminHandlerContextWithBody } from '../../shared/utils/handlerUtils.js';
import { LargeUploadUrlRequest, LargeUploadUrlResponse } from '../../shared/types/api.js';
import { AuditEventType, AuditOutcome } from '../../shared/types/audit.js';

async function getLargeUploadUrlHandler({ event, ctx, body }: AdminHandlerContextWithBody<unknown>) {
  console.log('Get large upload URL request');

  const request = validate<LargeUploadUrlRequest>(validation.largeUploadUrlRequestSchema, body);

  const { applicationId, version, fileName, fileSize, contentType } = request;

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

  // Storage quota gate. Primary enforcement point: rejecting here
  // means we never hand out a pre-signed URL for a file that wouldn't
  // fit, so no orphaned objects in S3. completeLargeUpload has a
  // defensive backstop in case the actual upload exceeds the size
  // declared here.
  const storageCheck = await checkStorageQuota(ctx, fileSize);
  if (!storageCheck.allowed) {
    await recordTenantEvent(ctx.tablePrefix, {
      eventType: AuditEventType.STORAGE_QUOTA_REJECTED,
      outcome: 'FAILED' as AuditOutcome,
      actor: `customer:${ctx.customerId}`,
      tenantId: ctx.tenantId,
      ...extractClientContext(event),
      details: {
        requestedBytes: fileSize,
        currentBytes: storageCheck.current,
        limitBytes: storageCheck.limit,
        applicationId,
        fileName,
      },
    });
    return responses.payloadTooLarge(storageCheck.message!, {
      currentBytes: storageCheck.current,
      limitBytes: storageCheck.limit,
      requestedBytes: fileSize,
    });
  }

  const bucketName = getApplicationsBucket(ctx);
  const uploadId = uuidv4();

  // Generate pre-signed upload URL
  const { url, expiresAt } = await s3.getUploadUrl(
    bucketName,
    applicationId,
    version,
    fileName,
    contentType || 'application/octet-stream',
    uploadId
  );

  const response: LargeUploadUrlResponse = {
    uploadId,
    uploadUrl: url,
    expiresAt: expiresAt.toISOString(),
  };

  return responses.success(response);
}

export const handler = withAdminAndBody(getLargeUploadUrlHandler);
