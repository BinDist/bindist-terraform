/**
 * Multi-Tenant DynamoDB Service
 * Provides data access with dynamic table prefixes based on tenant context
 */

import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { getDocumentClient } from '../data/dynamodb.js';
import {
  Customer,
  Application,
  CustomerApplication,
  Version,
  ApplicationFile,
  Download,
  Upload,
} from '../types/entities.js';
import { TenantApiKey } from '../types/tenantAuth.js';
import { ApplicationsListQuery, PaginationMeta } from '../types/api.js';
import { DOWNLOAD_RECORDS_TTL_SECONDS, UPLOAD_RECORDS_TTL_SECONDS, calculateTtl } from '../config/constants.js';

/**
 * Tenant-scoped share token (stored in tenant's share-tokens table)
 * Unlike global ShareToken, this doesn't include tablePrefix/s3Prefix
 */
interface TenantShareToken {
  token: string;
  applicationId: string;
  version: string;
  fileId?: string;
  customerId: string;
  createdAt: string;
  expiresAt: string;
  ttl: number;
}

const sendCommand = async (cmd: any) => (await getDocumentClient()).send(cmd);

/**
 * Get table names for a specific tenant
 */
function getTenantTables(tablePrefix: string) {
  return {
    customers: `${tablePrefix}-customers`,
    applications: `${tablePrefix}-applications`,
    customerApplications: `${tablePrefix}-customer-applications`,
    versions: `${tablePrefix}-versions`,
    applicationFiles: `${tablePrefix}-application-files`,
    downloads: `${tablePrefix}-downloads`,
    uploads: `${tablePrefix}-uploads`,
    apiKeys: `${tablePrefix}-api-keys`,
    shareTokens: `${tablePrefix}-share-tokens`,
  };
}

// =============================================================================
// Customer Operations
// =============================================================================

/**
 * Get customer by ID
 */
export async function getCustomer(
  tablePrefix: string,
  customerId: string
): Promise<Customer | null> {
  const tables = getTenantTables(tablePrefix);
  const result = await sendCommand(
    new GetCommand({
      TableName: tables.customers,
      Key: { customerId },
    })
  );
  return (result.Item as Customer) || null;
}

/**
 * Create or update customer
 */
export async function putCustomer(
  tablePrefix: string,
  customer: Customer
): Promise<void> {
  const tables = getTenantTables(tablePrefix);
  await sendCommand(
    new PutCommand({
      TableName: tables.customers,
      Item: customer,
    })
  );
}

/**
 * Update customer with partial data
 */
export async function updateCustomer(
  tablePrefix: string,
  customerId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const tables = getTenantTables(tablePrefix);

  const updateExpressionParts: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  Object.entries(updates).forEach(([key, value], index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    updateExpressionParts.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;
  });

  await sendCommand(
    new UpdateCommand({
      TableName: tables.customers,
      Key: { customerId },
      UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );
}

// =============================================================================
// Application Operations
// =============================================================================

/**
 * List applications for a customer with pagination and filtering
 */
export async function listApplications(
  tablePrefix: string,
  customerId: string,
  query: ApplicationsListQuery
): Promise<{ applications: Application[]; pagination: PaginationMeta }> {
  const tables = getTenantTables(tablePrefix);
  const { page = 1, limit = 20, search, isActive, tags, sortBy = 'name', sortOrder = 'asc' } = query;

  // First get application IDs the customer has access to
  const accessResult = await sendCommand(
    new QueryCommand({
      TableName: tables.customerApplications,
      KeyConditionExpression: 'customerId = :customerId',
      ExpressionAttributeValues: {
        ':customerId': customerId,
      },
    })
  );

  const customerApps = (accessResult.Items || []) as CustomerApplication[];
  if (customerApps.length === 0) {
    return {
      applications: [],
      pagination: { page, limit, total: 0, hasNext: false, hasPrevious: false },
    };
  }

  // Batch get all applications
  const applications: Application[] = [];
  for (const ca of customerApps) {
    const app = await getApplication(tablePrefix, ca.applicationId);
    if (app) {
      applications.push(app);
    }
  }

  return processApplicationsResult(applications, { page, limit, search, isActive, tags, sortBy, sortOrder });
}

/**
 * List ALL applications in the tenant (admin only)
 * Returns applications with list of customerIds that have access
 */
export async function listAllApplications(
  tablePrefix: string,
  query: ApplicationsListQuery
): Promise<{ applications: (Application & { customerIds: string[] })[]; pagination: PaginationMeta }> {
  const tables = getTenantTables(tablePrefix);
  const { page = 1, limit = 20, search, isActive, tags, sortBy = 'name', sortOrder = 'asc' } = query;

  // Get all applications (now simple - one record per app)
  const appsResult = await sendCommand(
    new ScanCommand({
      TableName: tables.applications,
    })
  );

  const applications = (appsResult.Items || []) as Application[];

  // Get all customer-application mappings to collect customerIds
  const mappingsResult = await sendCommand(
    new ScanCommand({
      TableName: tables.customerApplications,
    })
  );

  const mappings = (mappingsResult.Items || []) as CustomerApplication[];

  // Build map of applicationId -> customerIds
  const customerIdsByApp = new Map<string, string[]>();
  for (const mapping of mappings) {
    const existing = customerIdsByApp.get(mapping.applicationId) || [];
    existing.push(mapping.customerId);
    customerIdsByApp.set(mapping.applicationId, existing);
  }

  // Combine applications with their customerIds
  const appsWithCustomers = applications.map(app => ({
    ...app,
    customerIds: customerIdsByApp.get(app.applicationId) || [],
  }));

  const processed = processApplicationsResult(
    appsWithCustomers as unknown as Application[],
    { page, limit, search, isActive, tags, sortBy, sortOrder }
  );

  return {
    applications: processed.applications as unknown as (Application & { customerIds: string[] })[],
    pagination: processed.pagination,
  };
}

/**
 * List all customers in the tenant (admin only)
 */
export async function listAllCustomers(
  tablePrefix: string
): Promise<Customer[]> {
  const tables = getTenantTables(tablePrefix);
  const result = await sendCommand(
    new ScanCommand({
      TableName: tables.customers,
    })
  );
  return (result.Items || []) as unknown as Customer[];
}

/**
 * Count active non-admin customers in the tenant
 * Used for quota enforcement
 * @param excludeCustomerId Optional customer ID to exclude from count (for updates)
 */
export async function countActiveNonAdminCustomers(
  tablePrefix: string,
  excludeCustomerId?: string
): Promise<number> {
  const tables = getTenantTables(tablePrefix);
  const result = await sendCommand(
    new ScanCommand({
      TableName: tables.customers,
      FilterExpression: '(attribute_not_exists(isAdmin) OR isAdmin = :false) AND isActive = :true',
      ExpressionAttributeValues: {
        ':false': false,
        ':true': true,
      },
      ProjectionExpression: 'customerId',
    })
  );

  const items = result.Items || [];

  // Exclude specific customer if provided (used when checking quota for re-enabling)
  if (excludeCustomerId) {
    return items.filter((item: any) => (item as { customerId: string }).customerId !== excludeCustomerId).length;
  }

  return items.length;
}

/**
 * Process applications list with filtering, sorting, and pagination
 */
function processApplicationsResult(
  items: Application[],
  query: { page: number; limit: number; search?: string; isActive?: boolean; tags?: string[]; sortBy: string; sortOrder: string }
): { applications: Application[]; pagination: PaginationMeta } {
  const { page, limit, search, isActive, tags, sortBy, sortOrder } = query;

  let applications = [...items];

  // Filter out soft-deleted applications
  applications = applications.filter((app) => !app.deletedAt);

  // Filter by active status
  if (isActive !== undefined) {
    applications = applications.filter((app) => app.isActive === isActive);
  }

  // Filter by search term
  if (search) {
    const searchLower = search.toLowerCase();
    applications = applications.filter(
      (app) =>
        app.name.toLowerCase().includes(searchLower) ||
        app.description?.toLowerCase().includes(searchLower)
    );
  }

  // Filter by tags
  if (tags && tags.length > 0) {
    applications = applications.filter(
      (app) => app.tags && tags.some((tag) => app.tags?.includes(tag))
    );
  }

  // Sort
  applications.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'createdAt':
        comparison = a.createdAt.localeCompare(b.createdAt);
        break;
      case 'updatedAt':
        comparison = a.updatedAt.localeCompare(b.updatedAt);
        break;
    }
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  // Paginate
  const total = applications.length;
  const start = (page - 1) * limit;
  const paginatedApps = applications.slice(start, start + limit);

  return {
    applications: paginatedApps,
    pagination: {
      page,
      limit,
      total,
      hasNext: start + limit < total,
      hasPrevious: page > 1,
    },
  };
}

/**
 * Options for getting an application
 */
export interface GetApplicationOptions {
  /** Include soft-deleted applications (default: false) */
  includeDeleted?: boolean;
}

/**
 * Get application by ID
 */
export async function getApplication(
  tablePrefix: string,
  applicationId: string,
  options?: GetApplicationOptions
): Promise<Application | null> {
  const tables = getTenantTables(tablePrefix);
  const result = await sendCommand(
    new GetCommand({
      TableName: tables.applications,
      Key: { applicationId },
    })
  );
  const app = (result.Item as Application) || null;

  // Filter out deleted applications unless includeDeleted is true
  if (app && app.deletedAt && !options?.includeDeleted) {
    return null;
  }

  return app;
}

/**
 * Create or update application
 */
export async function putApplication(
  tablePrefix: string,
  application: Application
): Promise<void> {
  const tables = getTenantTables(tablePrefix);
  await sendCommand(
    new PutCommand({
      TableName: tables.applications,
      Item: application,
    })
  );
}

/**
 * Delete application (removes from applications table)
 */
export async function deleteApplication(
  tablePrefix: string,
  applicationId: string
): Promise<void> {
  const tables = getTenantTables(tablePrefix);
  await sendCommand(
    new DeleteCommand({
      TableName: tables.applications,
      Key: { applicationId },
    })
  );
}

/**
 * Soft delete an application by setting deletedAt timestamp
 * The application remains in the database but is hidden from listings
 */
export async function softDeleteApplication(
  tablePrefix: string,
  applicationId: string
): Promise<Application> {
  const tables = getTenantTables(tablePrefix);
  const now = new Date().toISOString();

  const result = await sendCommand(
    new UpdateCommand({
      TableName: tables.applications,
      Key: { applicationId },
      UpdateExpression: 'SET deletedAt = :deletedAt, updatedAt = :updatedAt, isActive = :isActive',
      ExpressionAttributeValues: {
        ':deletedAt': now,
        ':updatedAt': now,
        ':isActive': false,
      },
      ReturnValues: 'ALL_NEW',
    })
  );

  return result.Attributes as Application;
}

/**
 * Count applications in the tenant (excluding soft-deleted)
 * Used for quota enforcement
 */
export async function countApplications(
  tablePrefix: string
): Promise<number> {
  const tables = getTenantTables(tablePrefix);
  const result = await sendCommand(
    new ScanCommand({
      TableName: tables.applications,
      FilterExpression: 'attribute_not_exists(deletedAt)',
      Select: 'COUNT',
    })
  );
  return result.Count || 0;
}

/**
 * Sum the bytes of every file the tenant currently has stored, as
 * recorded in the per-tenant application_files table. Single-file
 * uploads (uploadBinary) and multi-file uploads (completeLargeUpload)
 * both write a row here, so this is a complete picture of what's in
 * the applications bucket. Backups bucket sits outside the quota and
 * is not included.
 *
 * Used both by the storage-quota gate (checkStorageQuota) at upload
 * time and by the account-page usage display, so the gate and the
 * display can never disagree about what counts.
 *
 * Implementation: Scan with ProjectionExpression='fileSize' and sum
 * in JS. Native on DynamoDB; the dynamo2pg adapter translates the
 * Scan into `SELECT "fileSize" FROM <schema>."application_files"` on
 * Postgres. A native SUM aggregate would be faster on Postgres but
 * the JS-side accumulator keeps the function provider-portable.
 */
export async function getStorageUsageBytes(
  tablePrefix: string
): Promise<number> {
  const tables = getTenantTables(tablePrefix);
  let total = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await sendCommand(
      new ScanCommand({
        TableName: tables.applicationFiles,
        ProjectionExpression: 'fileSize',
        ExclusiveStartKey: exclusiveStartKey,
      })
    );
    for (const row of result.Items ?? []) {
      const size = (row as { fileSize?: number }).fileSize;
      if (typeof size === 'number') total += size;
    }
    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return total;
}

// =============================================================================
// Customer-Application Access Operations
// =============================================================================

/**
 * Grant a customer access to an application
 */
export async function grantApplicationAccess(
  tablePrefix: string,
  customerId: string,
  applicationId: string,
  grantedBy?: string
): Promise<void> {
  const tables = getTenantTables(tablePrefix);
  const now = new Date().toISOString();

  await sendCommand(
    new PutCommand({
      TableName: tables.customerApplications,
      Item: {
        customerId,
        applicationId,
        grantedAt: now,
        grantedBy,
      } as CustomerApplication,
    })
  );
}

/**
 * Revoke a customer's access to an application
 */
export async function revokeApplicationAccess(
  tablePrefix: string,
  customerId: string,
  applicationId: string
): Promise<void> {
  const tables = getTenantTables(tablePrefix);

  await sendCommand(
    new DeleteCommand({
      TableName: tables.customerApplications,
      Key: { customerId, applicationId },
    })
  );
}

/**
 * Check if a customer has access to an application
 */
export async function hasApplicationAccess(
  tablePrefix: string,
  customerId: string,
  applicationId: string
): Promise<boolean> {
  const tables = getTenantTables(tablePrefix);

  const result = await sendCommand(
    new GetCommand({
      TableName: tables.customerApplications,
      Key: { customerId, applicationId },
    })
  );

  return !!result.Item;
}

/**
 * Get all customers with access to an application
 */
export async function getApplicationCustomers(
  tablePrefix: string,
  applicationId: string
): Promise<CustomerApplication[]> {
  const tables = getTenantTables(tablePrefix);

  const result = await sendCommand(
    new QueryCommand({
      TableName: tables.customerApplications,
      IndexName: 'applicationId-index',
      KeyConditionExpression: 'applicationId = :applicationId',
      ExpressionAttributeValues: {
        ':applicationId': applicationId,
      },
    })
  );

  return (result.Items || []) as CustomerApplication[];
}

/**
 * Get all applications a customer has access to
 */
export async function getCustomerApplications(
  tablePrefix: string,
  customerId: string
): Promise<CustomerApplication[]> {
  const tables = getTenantTables(tablePrefix);

  const result = await sendCommand(
    new QueryCommand({
      TableName: tables.customerApplications,
      KeyConditionExpression: 'customerId = :customerId',
      ExpressionAttributeValues: {
        ':customerId': customerId,
      },
    })
  );

  return (result.Items || []) as CustomerApplication[];
}

// =============================================================================
// Version Operations
// =============================================================================

/**
 * List versions for an application
 */
export async function listVersions(
  tablePrefix: string,
  applicationId: string
): Promise<Version[]> {
  const tables = getTenantTables(tablePrefix);
  const result = await sendCommand(
    new QueryCommand({
      TableName: tables.versions,
      KeyConditionExpression: 'applicationId = :applicationId',
      ExpressionAttributeValues: {
        ':applicationId': applicationId,
      },
    })
  );

  let versions = (result.Items || []) as Version[];

  // Filter to active only
  versions = versions.filter((v) => v.isActive);

  // Sort by version descending (newest first)
  versions.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

  return versions;
}

/**
 * Get version by application ID and version string
 */
export async function getVersion(
  tablePrefix: string,
  applicationId: string,
  version: string
): Promise<Version | null> {
  const tables = getTenantTables(tablePrefix);
  const result = await sendCommand(
    new GetCommand({
      TableName: tables.versions,
      Key: { applicationId, version },
    })
  );
  return (result.Item as Version) || null;
}

/**
 * Create or update version
 */
export async function putVersion(
  tablePrefix: string,
  version: Version
): Promise<void> {
  const tables = getTenantTables(tablePrefix);
  await sendCommand(
    new PutCommand({
      TableName: tables.versions,
      Item: version,
    })
  );
}

/**
 * Increment download count for a version
 */
export async function incrementDownloadCount(
  tablePrefix: string,
  applicationId: string,
  version: string
): Promise<void> {
  const tables = getTenantTables(tablePrefix);
  await sendCommand(
    new UpdateCommand({
      TableName: tables.versions,
      Key: { applicationId, version },
      UpdateExpression: 'SET downloadCount = if_not_exists(downloadCount, :zero) + :inc',
      ExpressionAttributeValues: {
        ':zero': 0,
        ':inc': 1,
      },
    })
  );
}

// =============================================================================
// Application File Operations
// =============================================================================

/**
 * List files for a version
 */
export async function listVersionFiles(
  tablePrefix: string,
  versionId: string
): Promise<ApplicationFile[]> {
  const tables = getTenantTables(tablePrefix);
  const result = await sendCommand(
    new QueryCommand({
      TableName: tables.applicationFiles,
      KeyConditionExpression: 'versionId = :versionId',
      ExpressionAttributeValues: {
        ':versionId': versionId,
      },
    })
  );

  const files = (result.Items || []) as ApplicationFile[];
  files.sort((a, b) => a.order - b.order);
  return files;
}

/**
 * Get a specific file from a version
 */
export async function getVersionFile(
  tablePrefix: string,
  versionId: string,
  fileId: string
): Promise<ApplicationFile | null> {
  const tables = getTenantTables(tablePrefix);
  const result = await sendCommand(
    new GetCommand({
      TableName: tables.applicationFiles,
      Key: { versionId, fileId },
    })
  );
  return (result.Item as ApplicationFile) || null;
}

/**
 * Create or update application file
 */
export async function putApplicationFile(
  tablePrefix: string,
  file: ApplicationFile
): Promise<void> {
  const tables = getTenantTables(tablePrefix);
  await sendCommand(
    new PutCommand({
      TableName: tables.applicationFiles,
      Item: file,
    })
  );
}

// =============================================================================
// Download Operations
// =============================================================================

/**
 * Record a download
 */
export async function recordDownload(
  tablePrefix: string,
  download: Download
): Promise<void> {
  const tables = getTenantTables(tablePrefix);
  const ttl = calculateTtl(DOWNLOAD_RECORDS_TTL_SECONDS);

  await sendCommand(
    new PutCommand({
      TableName: tables.downloads,
      Item: { ...download, ttl },
    })
  );
}

/**
 * List downloads for activity page
 */
export async function listDownloads(
  tablePrefix: string,
  options?: {
    customerId?: string;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }
): Promise<Download[]> {
  const tables = getTenantTables(tablePrefix);
  const { customerId, limit = 50, startDate, endDate } = options || {};

  let result;

  if (customerId) {
    // Query by customer using GSI
    let keyConditionExpression = 'customerId = :customerId';
    const expressionAttributeValues: Record<string, unknown> = {
      ':customerId': customerId,
    };

    // Add date range filter if provided
    if (startDate && endDate) {
      keyConditionExpression += ' AND downloadedAt BETWEEN :startDate AND :endDate';
      expressionAttributeValues[':startDate'] = startDate;
      expressionAttributeValues[':endDate'] = endDate;
    } else if (startDate) {
      keyConditionExpression += ' AND downloadedAt >= :startDate';
      expressionAttributeValues[':startDate'] = startDate;
    } else if (endDate) {
      keyConditionExpression += ' AND downloadedAt <= :endDate';
      expressionAttributeValues[':endDate'] = endDate;
    }

    result = await sendCommand(
      new QueryCommand({
        TableName: tables.downloads,
        IndexName: 'customerId-downloadedAt-index',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false, // Most recent first
        Limit: limit,
      })
    );
  } else {
    // Scan all downloads (for admin view)
    let filterExpression: string | undefined;
    const expressionAttributeValues: Record<string, unknown> = {};

    if (startDate && endDate) {
      filterExpression = 'downloadedAt BETWEEN :startDate AND :endDate';
      expressionAttributeValues[':startDate'] = startDate;
      expressionAttributeValues[':endDate'] = endDate;
    } else if (startDate) {
      filterExpression = 'downloadedAt >= :startDate';
      expressionAttributeValues[':startDate'] = startDate;
    } else if (endDate) {
      filterExpression = 'downloadedAt <= :endDate';
      expressionAttributeValues[':endDate'] = endDate;
    }

    result = await sendCommand(
      new ScanCommand({
        TableName: tables.downloads,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0
          ? expressionAttributeValues
          : undefined,
        Limit: limit * 2, // Scan may need more due to filtering
      })
    );
  }

  const downloads = (result.Items || []) as Download[];

  // Sort by date descending
  downloads.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));

  // Limit results
  return downloads.slice(0, limit);
}

// =============================================================================
// Upload Operations
// =============================================================================

/**
 * Get the most recent upload by a customer
 * Used for IP change detection
 */
export async function getLastUploadByCustomer(
  tablePrefix: string,
  customerId: string
): Promise<Upload | null> {
  const tables = getTenantTables(tablePrefix);

  const result = await sendCommand(
    new QueryCommand({
      TableName: tables.uploads,
      IndexName: 'customerId-uploadedAt-index',
      KeyConditionExpression: 'customerId = :customerId',
      ExpressionAttributeValues: {
        ':customerId': customerId,
      },
      ScanIndexForward: false, // Descending order (most recent first)
      Limit: 1,
    })
  );

  return (result.Items?.[0] as Upload) || null;
}

/**
 * Record an upload with IP change detection
 */
export async function recordUpload(
  tablePrefix: string,
  upload: Omit<Upload, 'ipChanged' | 'previousIp' | 'ttl'>
): Promise<Upload> {
  const tables = getTenantTables(tablePrefix);
  const ttl = calculateTtl(UPLOAD_RECORDS_TTL_SECONDS);

  // Check for IP change by getting the last upload from this customer
  const lastUpload = await getLastUploadByCustomer(tablePrefix, upload.customerId);

  let ipChanged = false;
  let previousIp: string | undefined;

  if (lastUpload && lastUpload.clientIp !== upload.clientIp) {
    ipChanged = true;
    previousIp = lastUpload.clientIp;
    console.warn(
      `IP changed for customer ${upload.customerId}: ${previousIp} -> ${upload.clientIp}`
    );
  }

  const uploadRecord: Upload = {
    ...upload,
    ipChanged,
    previousIp,
    ttl,
  };

  await sendCommand(
    new PutCommand({
      TableName: tables.uploads,
      Item: uploadRecord,
    })
  );

  return uploadRecord;
}

/**
 * List uploads for activity page
 */
export async function listUploads(
  tablePrefix: string,
  options?: {
    customerId?: string;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }
): Promise<Upload[]> {
  const tables = getTenantTables(tablePrefix);
  const { customerId, limit = 50, startDate, endDate } = options || {};

  let result;

  if (customerId) {
    // Query by customer using GSI
    let keyConditionExpression = 'customerId = :customerId';
    const expressionAttributeValues: Record<string, unknown> = {
      ':customerId': customerId,
    };

    // Add date range filter if provided
    if (startDate && endDate) {
      keyConditionExpression += ' AND uploadedAt BETWEEN :startDate AND :endDate';
      expressionAttributeValues[':startDate'] = startDate;
      expressionAttributeValues[':endDate'] = endDate;
    } else if (startDate) {
      keyConditionExpression += ' AND uploadedAt >= :startDate';
      expressionAttributeValues[':startDate'] = startDate;
    } else if (endDate) {
      keyConditionExpression += ' AND uploadedAt <= :endDate';
      expressionAttributeValues[':endDate'] = endDate;
    }

    result = await sendCommand(
      new QueryCommand({
        TableName: tables.uploads,
        IndexName: 'customerId-uploadedAt-index',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false, // Most recent first
        Limit: limit,
      })
    );
  } else {
    // Scan all uploads (for admin view)
    let filterExpression: string | undefined;
    const expressionAttributeValues: Record<string, unknown> = {};

    if (startDate && endDate) {
      filterExpression = 'uploadedAt BETWEEN :startDate AND :endDate';
      expressionAttributeValues[':startDate'] = startDate;
      expressionAttributeValues[':endDate'] = endDate;
    } else if (startDate) {
      filterExpression = 'uploadedAt >= :startDate';
      expressionAttributeValues[':startDate'] = startDate;
    } else if (endDate) {
      filterExpression = 'uploadedAt <= :endDate';
      expressionAttributeValues[':endDate'] = endDate;
    }

    result = await sendCommand(
      new ScanCommand({
        TableName: tables.uploads,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0
          ? expressionAttributeValues
          : undefined,
        Limit: limit * 2, // Scan may need more due to filtering
      })
    );
  }

  const uploads = (result.Items || []) as Upload[];

  // Sort by date descending
  uploads.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  // Limit results
  return uploads.slice(0, limit);
}

// =============================================================================
// API Key Operations
// =============================================================================

/**
 * Store API key mapping for fast lookup
 */
export async function putApiKey(
  tablePrefix: string,
  apiKey: TenantApiKey
): Promise<void> {
  const tables = getTenantTables(tablePrefix);
  await sendCommand(
    new PutCommand({
      TableName: tables.apiKeys,
      Item: apiKey,
    })
  );
}

/**
 * Get API key by hash
 */
export async function getApiKey(
  tablePrefix: string,
  apiKeyHash: string
): Promise<TenantApiKey | null> {
  const tables = getTenantTables(tablePrefix);
  const result = await sendCommand(
    new GetCommand({
      TableName: tables.apiKeys,
      Key: { apiKeyHash },
    })
  );
  return (result.Item as TenantApiKey) || null;
}

/**
 * List all API keys in the tenant (admin only)
 */
export async function listAllApiKeys(
  tablePrefix: string
): Promise<TenantApiKey[]> {
  const tables = getTenantTables(tablePrefix);
  const result = await sendCommand(
    new ScanCommand({
      TableName: tables.apiKeys,
    })
  );
  return (result.Items || []) as unknown as TenantApiKey[];
}

/**
 * Delete an API key by hash
 */
export async function deleteApiKey(
  tablePrefix: string,
  apiKeyHash: string
): Promise<void> {
  const tables = getTenantTables(tablePrefix);
  await sendCommand(
    new DeleteCommand({
      TableName: tables.apiKeys,
      Key: { apiKeyHash },
    })
  );
}

// =============================================================================
// Share Token Operations
// =============================================================================

/**
 * Store a share token
 */
export async function putShareToken(
  tablePrefix: string,
  shareToken: TenantShareToken
): Promise<void> {
  const tables = getTenantTables(tablePrefix);
  await sendCommand(
    new PutCommand({
      TableName: tables.shareTokens,
      Item: shareToken,
    })
  );
}

/**
 * Get a share token by token string
 */
export async function getShareToken(
  tablePrefix: string,
  token: string
): Promise<TenantShareToken | null> {
  const tables = getTenantTables(tablePrefix);
  const result = await sendCommand(
    new GetCommand({
      TableName: tables.shareTokens,
      Key: { token },
    })
  );
  return (result.Item as TenantShareToken) || null;
}

// =============================================================================
// Global Share Tokens (stored in control-plane table for public access)
// =============================================================================

const GLOBAL_SHARE_TOKENS_TABLE = process.env.GLOBAL_SHARE_TOKENS_TABLE
  || `${process.env.TABLE_PREFIX || 'bindist-dev'}-share-tokens`;

import { ShareToken } from '../types/entities.js';

/**
 * Error thrown when a share token already exists (collision)
 */
export class TokenCollisionError extends Error {
  constructor(token: string) {
    super(`Share token collision: ${token}`);
    this.name = 'TokenCollisionError';
  }
}

/**
 * Store a share token in the global table (for public access)
 * Uses conditional put to prevent overwriting existing tokens (collision protection)
 * @throws TokenCollisionError if token already exists
 */
export async function putGlobalShareToken(shareToken: ShareToken): Promise<void> {
  try {
    await sendCommand(
      new PutCommand({
        TableName: GLOBAL_SHARE_TOKENS_TABLE,
        Item: shareToken,
        ConditionExpression: 'attribute_not_exists(#token)',
        ExpressionAttributeNames: { '#token': 'token' },
      })
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      throw new TokenCollisionError(shareToken.token);
    }
    throw error;
  }
}

/**
 * Get a share token from the global table
 */
export async function getGlobalShareToken(token: string): Promise<ShareToken | null> {
  const result = await sendCommand(
    new GetCommand({
      TableName: GLOBAL_SHARE_TOKENS_TABLE,
      Key: { token },
    })
  );
  return (result.Item as ShareToken) || null;
}

// =============================================================================
// Export
// =============================================================================

export const multiTenantDynamoService = {
  // Customers
  getCustomer,
  putCustomer,

  // Applications
  listApplications,
  getApplication,
  putApplication,
  deleteApplication,
  softDeleteApplication,
  countApplications,

  // Customer-Application Access
  grantApplicationAccess,
  revokeApplicationAccess,
  hasApplicationAccess,
  getApplicationCustomers,
  getCustomerApplications,

  // Versions
  listVersions,
  getVersion,
  putVersion,
  incrementDownloadCount,

  // Application Files
  listVersionFiles,
  getVersionFile,
  putApplicationFile,

  // Downloads
  recordDownload,
  listDownloads,

  // Uploads
  recordUpload,
  listUploads,
  getLastUploadByCustomer,

  // API Keys
  putApiKey,
  getApiKey,

  // Share Tokens
  putShareToken,
  getShareToken,
};
