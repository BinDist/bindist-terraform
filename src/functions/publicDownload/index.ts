/**
 * Public Download Lambda Handler
 * GET /v1/downloads/d/{token}
 *
 * Handles public download via share token - redirects to S3 pre-signed URL
 * This is a PUBLIC endpoint - no authentication required
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import * as s3 from '../../shared/services/multiTenantS3Service.js';
import { Download, FileType } from '../../shared/types/entities.js';

/**
 * Build the S3 bucket name from s3Prefix
 * Uses APPLICATIONS_BUCKET env var (set by Terraform) or constructs from context.
 * On Scaleway multi-tenant, APPLICATIONS_BUCKET is empty and AWS_ACCOUNT_ID is
 * unset, so per-tenant buckets are named `${s3Prefix}-applications` (no suffix).
 */
function getApplicationsBucket(s3Prefix: string): string {
  if (process.env.APPLICATIONS_BUCKET) {
    return process.env.APPLICATIONS_BUCKET;
  }
  const accountId = process.env.AWS_ACCOUNT_ID;
  return accountId
    ? `${s3Prefix}-applications-${accountId}`
    : `${s3Prefix}-applications`;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const token = event.pathParameters?.token;

    if (!token) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Token is required' },
        }),
      };
    }

    // Look up the share token from the GLOBAL table
    const shareToken = await dynamo.getGlobalShareToken(token);

    if (!shareToken) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Invalid or expired download link' },
        }),
      };
    }

    // Check if token has expired
    const now = new Date();
    const expiresAt = new Date(shareToken.expiresAt);
    if (now > expiresAt) {
      return {
        statusCode: 410,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: { code: 'EXPIRED', message: 'This download link has expired' },
        }),
      };
    }

    const { applicationId, version, fileId, customerId, tablePrefix, s3Prefix } = shareToken;
    const versionId = `${applicationId}-${version}`;
    const bucketName = getApplicationsBucket(s3Prefix);

    // Get file info using the tenant's table prefix
    let fileData;
    if (fileId) {
      fileData = await dynamo.getVersionFile(tablePrefix, versionId, fileId);
    } else {
      // Get the first MAIN file or first file
      const files = await dynamo.listVersionFiles(tablePrefix, versionId);
      if (files.length === 0) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            success: false,
            error: { code: 'NOT_FOUND', message: 'No files found for this version' },
          }),
        };
      }
      fileData = files.find(f => f.fileType === FileType.MAIN) || files[0];
    }

    if (!fileData) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: { code: 'NOT_FOUND', message: 'File not found' },
        }),
      };
    }

    // Generate pre-signed download URL using the tenant's bucket
    const { url } = await s3.getDownloadUrl(
      bucketName,
      applicationId,
      version,
      fileData.fileName,
      fileData.fileId
    );

    // Record download for analytics
    const downloadId = uuidv4();
    const download: Download = {
      applicationId,
      downloadId,
      customerId,
      versionId,
      fileId: fileData.fileId,
      clientIp: event.requestContext.identity?.sourceIp || 'unknown',
      userAgent: event.headers['user-agent'] || event.headers['User-Agent'] || 'unknown',
      downloadedAt: new Date().toISOString(),
      fileSize: fileData.fileSize,
      downloadSource: 'share',
      shareToken: token,
    };

    await dynamo.recordDownload(tablePrefix, download);
    await dynamo.incrementDownloadCount(tablePrefix, applicationId, version);

    // Return 302 redirect to the S3 URL
    return {
      statusCode: 302,
      headers: {
        'Location': url,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
      body: '',
    };
  } catch (error) {
    console.error('Error processing public download:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      }),
    };
  }
};
