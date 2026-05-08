/**
 * Create Share Link Lambda Handler
 * POST /v1/downloads/share
 *
 * Creates a short-lived share token for public download access
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomBytes } from 'crypto';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { TokenCollisionError } from '../../shared/services/multiTenantDynamoService.js';
import { responses } from '../../shared/utils/responses.js';
import { validate } from '../../shared/utils/validation.js';
import { getTenantContext } from '../../shared/utils/tenantContext.js';
import { ShareToken } from '../../shared/types/entities.js';
import Joi from 'joi';

// TTL configuration from environment variables
const SHARE_LINK_DEFAULT_TTL_MINUTES = parseInt(process.env.SHARE_LINK_DEFAULT_TTL_MINUTES || '30', 10);
const SHARE_LINK_MAX_TTL_MINUTES = parseInt(process.env.SHARE_LINK_MAX_TTL_MINUTES || '1440', 10);

// Maximum retry attempts for token collision (extremely unlikely to need even 1 retry)
const MAX_TOKEN_RETRIES = 3;

// Validation schema for share link request
const shareRequestSchema = Joi.object({
  applicationId: Joi.string().required(),
  version: Joi.string().required(),
  fileId: Joi.string().optional(),
  expiresInMinutes: Joi.number().integer().min(5).max(SHARE_LINK_MAX_TTL_MINUTES).default(SHARE_LINK_DEFAULT_TTL_MINUTES),
});

// Generate a short, URL-safe token using cryptographically secure randomness
function generateShortToken(): string {
  return randomBytes(12).toString('base64url'); // 16 URL-safe characters
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Create share link request', {
    body: event.body,
  });

  try {
    const ctx = getTenantContext(event);
    if (!ctx) {
      return responses.unauthorized('Tenant context not found');
    }

    // Parse and validate request body
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body || '{}') as Record<string, unknown>;
    } catch {
      return responses.badRequest('Invalid JSON body');
    }

    const params = validate<{
      applicationId: string;
      version: string;
      fileId?: string;
      expiresInMinutes: number;
    }>(shareRequestSchema, body);

    const { applicationId, version, fileId, expiresInMinutes } = params;

    // Verify application exists
    const application = await dynamo.getApplication(ctx.tablePrefix, applicationId);
    if (!application) {
      return responses.notFound(`Application '${applicationId}' not found`);
    }

    // Verify customer has access (non-admins only)
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

    // If fileId specified, verify it exists
    if (fileId) {
      const versionId = `${applicationId}-${version}`;
      const fileData = await dynamo.getVersionFile(ctx.tablePrefix, versionId, fileId);
      if (!fileData) {
        return responses.notFound(`File '${fileId}' not found in version '${version}'`);
      }
    }

    // Generate and store share token with collision retry
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000);
    const ttl = Math.floor(expiresAt.getTime() / 1000);

    let token: string | null = null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_TOKEN_RETRIES; attempt++) {
      const candidateToken = generateShortToken();

      const shareToken: ShareToken = {
        token: candidateToken,
        applicationId,
        version,
        fileId,
        customerId: ctx.customerId,
        tablePrefix: ctx.tablePrefix,
        s3Prefix: ctx.s3Prefix,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        ttl,
      };

      try {
        // Store in global share-tokens table for public access
        // This will throw TokenCollisionError if token already exists
        await dynamo.putGlobalShareToken(shareToken);
        token = candidateToken;
        break;
      } catch (error) {
        if (error instanceof TokenCollisionError) {
          console.warn(`Token collision on attempt ${attempt + 1}, retrying...`);
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    if (!token) {
      console.error('Failed to generate unique token after max retries', lastError);
      throw new Error('Failed to generate share link, please try again');
    }

    // Build the share URL
    // Custom domains don't include the stage in the path; only the raw
    // execute-api domain needs the stage prefix.
    const domain = event.requestContext.domainName || '';
    const isCustomDomain = domain !== '' && !domain.includes('.execute-api.');
    const apiUrl = isCustomDomain
      ? `https://${domain}`
      : `https://${domain}/${event.requestContext.stage}`;
    const shareUrl = `${apiUrl}/v1/downloads/d/${token}`;

    return responses.success({
      shareUrl,
      token,
      expiresAt: expiresAt.toISOString(),
      expiresInMinutes,
    });
  } catch (error) {
    console.error('Error creating share link:', error);
    return responses.handleError(error);
  }
};
