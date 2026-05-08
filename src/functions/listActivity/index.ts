/**
 * List Activity Lambda Handler
 * GET /v1/activity
 *
 * Lists uploads and downloads for activity log
 * Admin only - can view all activity across customers
 */

import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { responses } from '../../shared/utils/responses.js';
import { withAdmin, AdminHandlerContext } from '../../shared/utils/handlerUtils.js';

interface ActivityItem {
  type: 'upload' | 'download';
  id: string;
  applicationId: string;
  applicationName?: string;
  version: string;
  fileName?: string;
  fileSize?: number;
  customerId: string;
  customerName?: string;
  clientIp: string;
  timestamp: string;
  // Upload-specific fields
  uploadMethod?: 'direct' | 'large';
  ipChanged?: boolean;
  previousIp?: string;
  // Download-specific fields
  userAgent?: string;
}

async function listActivityHandler({ event, ctx }: AdminHandlerContext) {
  console.log('List activity request');

  // Parse query parameters
  const queryParams = event.queryStringParameters || {};
  const type = (queryParams.type || 'all') as 'uploads' | 'downloads' | 'all';
  const limit = Math.min(parseInt(queryParams.limit || '50', 10), 100);
  const customerId = queryParams.customerId;
  const startDate = queryParams.startDate;
  const endDate = queryParams.endDate;

  const activities: ActivityItem[] = [];

  // Fetch uploads if requested
  if (type === 'uploads' || type === 'all') {
    const uploads = await dynamo.listUploads(ctx.tablePrefix, {
      customerId,
      limit: type === 'all' ? limit : limit,
      startDate,
      endDate,
    });

    for (const upload of uploads) {
      activities.push({
        type: 'upload',
        id: upload.uploadId,
        applicationId: upload.applicationId,
        version: upload.version,
        fileName: upload.fileName,
        fileSize: upload.fileSize,
        customerId: upload.customerId,
        clientIp: upload.clientIp,
        timestamp: upload.uploadedAt,
        uploadMethod: upload.uploadMethod,
        ipChanged: upload.ipChanged,
        previousIp: upload.previousIp,
        userAgent: upload.userAgent,
      });
    }
  }

  // Fetch downloads if requested
  if (type === 'downloads' || type === 'all') {
    const downloads = await dynamo.listDownloads(ctx.tablePrefix, {
      customerId,
      limit: type === 'all' ? limit : limit,
      startDate,
      endDate,
    });

    for (const download of downloads) {
      // Extract version from versionId (format: applicationId-version)
      // Use replace to handle versions with dashes (e.g., "1.0.0-beta")
      const version = download.versionId
        ? download.versionId.replace(`${download.applicationId}-`, '')
        : 'unknown';
      activities.push({
        type: 'download',
        id: download.downloadId,
        applicationId: download.applicationId,
        version,
        fileName: undefined, // Downloads don't always have fileName
        fileSize: download.fileSize,
        customerId: download.customerId,
        clientIp: download.clientIp,
        timestamp: download.downloadedAt,
        userAgent: download.userAgent,
      });
    }
  }

  // Sort by timestamp descending (most recent first)
  activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Limit total results
  const limitedActivities = activities.slice(0, limit);

  // Enrich with application and customer names
  const applicationIds = [...new Set(limitedActivities.map(a => a.applicationId))];
  const customerIds = [...new Set(limitedActivities.map(a => a.customerId))];

  // Fetch application names
  const applicationNames: Record<string, string> = {};
  for (const appId of applicationIds) {
    const app = await dynamo.getApplication(ctx.tablePrefix, appId);
    if (app) {
      applicationNames[appId] = app.name;
    }
  }

  // Fetch customer names
  const customerNames: Record<string, string> = {};
  for (const custId of customerIds) {
    const customer = await dynamo.getCustomer(ctx.tablePrefix, custId);
    if (customer) {
      customerNames[custId] = customer.name;
    }
  }

  // Add names to activities
  for (const activity of limitedActivities) {
    activity.applicationName = applicationNames[activity.applicationId];
    activity.customerName = customerNames[activity.customerId];
  }

  return responses.success({
    activities: limitedActivities,
    count: limitedActivities.length,
    filters: {
      type,
      limit,
      customerId,
      startDate,
      endDate,
    },
  });
}

export const handler = withAdmin(listActivityHandler);
