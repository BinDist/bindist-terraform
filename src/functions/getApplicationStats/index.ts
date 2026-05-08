/**
 * Get Application Statistics Lambda Handler
 * GET /v1/applications/{id}/stats?version=...
 *
 * Returns download statistics for an application, optionally filtered by version.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { responses } from '../../shared/utils/responses.js';
import { getTenantContext } from '../../shared/utils/tenantContext.js';
import { Download } from '../../shared/types/entities.js';
import { getDocumentClient } from '../../shared/data/dynamodb.js';

const sendCommand = async (cmd: any) => (await getDocumentClient()).send(cmd);

interface DownloadStats {
  applicationId: string;
  version?: string;
  totalDownloads: number;
  uniqueCustomers: number;
  downloadsByVersion: Record<string, number>;
  downloadsByDate: Record<string, number>;
  recentDownloads: Array<{
    downloadedAt: string;
    version: string;
    customerId: string;
  }>;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Get application stats request', {
    pathParameters: event.pathParameters,
    queryParams: event.queryStringParameters,
  });

  try {
    const ctx = getTenantContext(event);
    if (!ctx) {
      return responses.unauthorized('Tenant context not found');
    }

    // Admin only endpoint
    if (!ctx.isAdmin) {
      return responses.forbidden('Admin access required');
    }

    const applicationId = event.pathParameters?.applicationId;
    if (!applicationId) {
      return responses.badRequest('Missing applicationId parameter');
    }

    const version = event.queryStringParameters?.version;

    // Query downloads for this application
    const tableName = `${ctx.tablePrefix}-downloads`;
    const downloads: Download[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const command = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'applicationId = :appId',
        ExpressionAttributeValues: {
          ':appId': applicationId,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      });

      const result = await sendCommand(command);
      downloads.push(...(result.Items as Download[] || []));
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Filter by version if specified
    let filteredDownloads = downloads;
    if (version) {
      const versionId = `${applicationId}-${version}`;
      filteredDownloads = downloads.filter(d => d.versionId === versionId);
    }

    // Calculate statistics
    const uniqueCustomers = new Set(filteredDownloads.map(d => d.customerId));

    const downloadsByVersion: Record<string, number> = {};
    const downloadsByDate: Record<string, number> = {};

    for (const download of filteredDownloads) {
      // Extract version from versionId (format: applicationId-version)
      const versionPart = download.versionId.replace(`${applicationId}-`, '');
      downloadsByVersion[versionPart] = (downloadsByVersion[versionPart] || 0) + 1;

      // Group by date (YYYY-MM-DD)
      const date = download.downloadedAt.split('T')[0];
      downloadsByDate[date] = (downloadsByDate[date] || 0) + 1;
    }

    // Get recent downloads (last 10)
    const sortedDownloads = [...filteredDownloads].sort(
      (a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime()
    );
    const recentDownloads = sortedDownloads.slice(0, 10).map(d => ({
      downloadedAt: d.downloadedAt,
      version: d.versionId.replace(`${applicationId}-`, ''),
      customerId: d.customerId,
    }));

    const stats: DownloadStats = {
      applicationId,
      version,
      totalDownloads: filteredDownloads.length,
      uniqueCustomers: uniqueCustomers.size,
      downloadsByVersion,
      downloadsByDate,
      recentDownloads,
    };

    return responses.success(stats);
  } catch (error) {
    console.error('Error getting application stats:', error);
    return responses.handleError(error);
  }
};
