/**
 * List Versions Lambda Handler
 * GET /v1/applications/{applicationId}/versions
 *
 * Query Parameters:
 * - changelog: Search term to filter versions by release notes content (case-insensitive)
 *
 * Supports X-Channel header:
 * - "Test": Returns all versions including disabled ones
 * - Other/missing: Returns only enabled versions (isEnabled: true)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { responses } from '../../shared/utils/responses.js';
import { getTenantContext } from '../../shared/utils/tenantContext.js';
import { VersionDto } from '../../shared/types/api.js';
import { Version } from '../../shared/types/entities.js';

/**
 * Get the channel from request headers (case-insensitive)
 */
function getChannel(event: APIGatewayProxyEvent): string | undefined {
  return event.headers['X-Channel'] || event.headers['x-channel'];
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const applicationId = event.pathParameters?.applicationId;
  const channel = getChannel(event);
  const changelogSearch = event.queryStringParameters?.changelog?.trim().toLowerCase();

  console.log('List versions request', { applicationId, channel, changelogSearch });

  try {
    const ctx = getTenantContext(event);
    if (!ctx) {
      return responses.unauthorized('Tenant context not found');
    }

    if (!applicationId) {
      return responses.badRequest('Application ID is required');
    }

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

    const allVersions = await dynamo.listVersions(ctx.tablePrefix, applicationId);

    // Filter versions based on channel
    // "Test" channel: include disabled versions
    // Other channels: only return enabled versions
    const isTestChannel = channel?.toLowerCase() === 'test';
    let versions: Version[] = isTestChannel
      ? allVersions
      : allVersions.filter((v) => v.isEnabled !== false);

    // Filter by changelog search term if provided
    if (changelogSearch) {
      versions = versions.filter(
        (v) => v.releaseNotes?.toLowerCase().includes(changelogSearch)
      );
    }

    const versionDtos: VersionDto[] = versions.map((v) => ({
      versionId: v.versionId,
      applicationId: v.applicationId,
      version: v.version,
      releaseNotes: v.releaseNotes,
      isActive: v.isActive,
      isEnabled: v.isEnabled ?? true, // Default to true for backwards compatibility
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      fileSize: v.fileSize,
      downloadCount: v.downloadCount,
    }));

    return responses.success({ versions: versionDtos });
  } catch (error) {
    console.error('Error listing versions:', error);
    return responses.handleError(error);
  }
};
