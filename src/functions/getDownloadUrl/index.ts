/**
 * Get Download URL Lambda Handler
 * GET /v1/downloads/url?applicationId=...&version=...&fileId=...
 *
 * Supports X-Channel header:
 * - "Test": Allows downloading disabled versions (isEnabled: false)
 * - Other/missing: Only allows downloading enabled versions
 */

import { v4 as uuidv4 } from 'uuid';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import * as s3 from '../../shared/services/multiTenantS3Service.js';
import { responses } from '../../shared/utils/responses.js';
import { validate, validation } from '../../shared/utils/validation.js';
import { getApplicationsBucket } from '../../shared/utils/tenantContext.js';
import { withAuth, HandlerContext } from '../../shared/utils/handlerUtils.js';
import { DownloadUrlResponse } from '../../shared/types/api.js';
import { Download, FileType } from '../../shared/types/entities.js';

interface DownloadUrlParams {
  applicationId: string;
  version: string;
  fileId?: string;
}

/**
 * Get the channel from request headers (case-insensitive)
 */
function getChannel(event: APIGatewayProxyEvent): string | undefined {
  return event.headers['X-Channel'] || event.headers['x-channel'];
}

async function getDownloadUrlHandler({ event, ctx }: HandlerContext) {
  const channel = getChannel(event);

  const params = validate<DownloadUrlParams>(
    validation.downloadUrlQuerySchema,
    event.queryStringParameters || {}
  );

  const { applicationId, version, fileId } = params;

  // Verify application exists
  const application = await dynamo.getApplication(ctx.tablePrefix, applicationId);
  if (!application) {
    return responses.notFound(`Application '${applicationId}' not found`);
  }

  // Regular users: verify they have access to this application
  if (!ctx.isAdmin) {
    const hasAccess = await dynamo.hasApplicationAccess(ctx.tablePrefix, ctx.customerId, applicationId);
    if (!hasAccess) {
      return responses.notFound(`Application '${applicationId}' not found`);
    }
  }

  // Get version
  const versionData = await dynamo.getVersion(ctx.tablePrefix, applicationId, version);
  if (!versionData || !versionData.isActive) {
    return responses.notFound(`Version '${version}' not found`);
  }

  // Check if version is enabled for download
  // "Test" channel allows downloading disabled versions
  const isTestChannel = channel?.toLowerCase() === 'test';
  const isEnabled = versionData.isEnabled !== false; // Default to true for backwards compatibility

  if (!isEnabled && !isTestChannel) {
    return responses.forbidden(`Version '${version}' is not enabled for download`);
  }

  const versionId = `${applicationId}-${version}`;
  let fileData;

  if (fileId) {
    fileData = await dynamo.getVersionFile(ctx.tablePrefix, versionId, fileId);
    if (!fileData) {
      return responses.notFound(`File '${fileId}' not found in version '${version}'`);
    }
  } else {
    const files = await dynamo.listVersionFiles(ctx.tablePrefix, versionId);
    if (files.length === 0) {
      return responses.notFound(`No files found for version '${version}'`);
    }
    fileData = files.find(f => f.fileType === FileType.MAIN) || files[0];
  }

  const { fileName, fileSize, checksum, fileId: actualFileId } = fileData;
  const bucketName = getApplicationsBucket(ctx);

  // Generate pre-signed download URL
  const { url, expiresAt } = await s3.getDownloadUrl(
    bucketName,
    applicationId,
    version,
    fileName,
    actualFileId
  );

  // Record download for analytics
  const downloadId = uuidv4();
  const download: Download = {
    applicationId,
    downloadId,
    customerId: ctx.customerId,
    versionId: `${applicationId}-${version}`,
    fileId: actualFileId,
    clientIp: event.requestContext.identity?.sourceIp || 'unknown',
    userAgent: event.headers['user-agent'] || event.headers['User-Agent'] || 'unknown',
    downloadedAt: new Date().toISOString(),
    fileSize,
    downloadSource: 'api',
  };

  await dynamo.recordDownload(ctx.tablePrefix, download);
  await dynamo.incrementDownloadCount(ctx.tablePrefix, applicationId, version);

  const response: DownloadUrlResponse = {
    downloadId,
    url,
    expiresAt: expiresAt.toISOString(),
    fileName,
    fileSize,
    checksum,
  };

  return responses.success(response);
}

export const handler = withAuth(getDownloadUrlHandler);
