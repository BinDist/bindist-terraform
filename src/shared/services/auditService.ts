/**
 * Audit Service
 *
 * Records and queries tenant-level audit events (per-tenant audit table).
 * Pre-tenant / payment audit events are handled by the parent repo's
 * paymentAuditService, which is overlaid at build time.
 */

import {
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import {
  AuditEvent,
  AuditEventType,
  AuditOutcome,
  AuditEventDetails,
  AUDIT_TTL_SECONDS,
} from '../types/audit.js';
import { getDocumentClient } from '../data/dynamodb.js';

/**
 * Parameters for recording an audit event
 */
export interface RecordAuditEventParams {
  eventType: AuditEventType;
  outcome: AuditOutcome;
  actor: string;
  signupId?: string;
  tenantId?: string;
  paymentReference?: string;
  clientIp?: string;
  userAgent?: string;
  details?: AuditEventDetails;
}

/**
 * Record a tenant-level audit event
 * Events are stored in the tenant's audit table
 */
export async function recordTenantEvent(
  tablePrefix: string,
  params: RecordAuditEventParams
): Promise<AuditEvent> {
  const client = await getDocumentClient();
  const now = new Date();
  const eventId = ulid();

  const event: AuditEvent = {
    eventType: params.eventType,
    eventId,
    timestamp: now.toISOString(),
    ttl: Math.floor(now.getTime() / 1000) + AUDIT_TTL_SECONDS,
    actor: params.actor,
    outcome: params.outcome,
    signupId: params.signupId,
    paymentReference: params.paymentReference,
    clientIp: params.clientIp,
    userAgent: params.userAgent,
    details: params.details,
  };

  const tableName = `${tablePrefix}-audit`;

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: event,
    })
  );

  console.log(`Recorded tenant audit event: ${params.eventType} for tenant ${params.tenantId}`);
  return event;
}

/**
 * Query audit events for a tenant
 */
export interface QueryAuditEventsParams {
  eventType?: AuditEventType;
  startDate?: string;
  endDate?: string;
  limit?: number;
  lastEventId?: string;
}

export interface QueryAuditEventsResult {
  events: AuditEvent[];
  lastEventId?: string;
  hasMore: boolean;
}

/**
 * Get audit events for a tenant with optional filters
 */
export async function getAuditEvents(
  tablePrefix: string,
  params: QueryAuditEventsParams = {}
): Promise<QueryAuditEventsResult> {
  const client = await getDocumentClient();
  const tableName = `${tablePrefix}-audit`;
  const limit = params.limit || 50;

  // If filtering by event type, query by that partition key
  if (params.eventType) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'eventType = :eventType',
        ExpressionAttributeValues: {
          ':eventType': params.eventType,
        },
        Limit: limit,
        ScanIndexForward: false, // Newest first
        ExclusiveStartKey: params.lastEventId
          ? { eventType: params.eventType, eventId: params.lastEventId }
          : undefined,
      })
    );

    const events = (result.Items as AuditEvent[]) || [];
    return {
      events,
      lastEventId: events.length > 0 ? events[events.length - 1].eventId : undefined,
      hasMore: !!result.LastEvaluatedKey,
    };
  }

  // Without eventType filter, use Scan (acceptable for audit logs with TTL)
  // Build filter expression for optional date range
  let filterExpression: string | undefined;
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, string> = {};

  if (params.startDate && params.endDate) {
    filterExpression = '#timestamp BETWEEN :startDate AND :endDate';
    expressionAttributeNames['#timestamp'] = 'timestamp';
    expressionAttributeValues[':startDate'] = params.startDate;
    expressionAttributeValues[':endDate'] = params.endDate;
  } else if (params.startDate) {
    filterExpression = '#timestamp >= :startDate';
    expressionAttributeNames['#timestamp'] = 'timestamp';
    expressionAttributeValues[':startDate'] = params.startDate;
  } else if (params.endDate) {
    filterExpression = '#timestamp <= :endDate';
    expressionAttributeNames['#timestamp'] = 'timestamp';
    expressionAttributeValues[':endDate'] = params.endDate;
  }

  // For Scan, we fetch more items and sort client-side
  const result = await client.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0
        ? expressionAttributeNames
        : undefined,
      ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0
        ? expressionAttributeValues
        : undefined,
      Limit: limit * 2, // Fetch more to account for filtering, then trim
    })
  );

  // Sort events by timestamp descending (newest first) since Scan doesn't guarantee order
  const events = ((result.Items as AuditEvent[]) || [])
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);

  return {
    events,
    lastEventId: undefined, // Pagination not supported for Scan
    hasMore: false,
  };
}

/**
 * Helper to extract client context from API Gateway event
 */
export function extractClientContext(event: {
  requestContext?: { identity?: { sourceIp?: string } };
  headers?: Record<string, string | undefined>;
}): { clientIp?: string; userAgent?: string } {
  const headers = event.headers || {};
  return {
    clientIp:
      event.requestContext?.identity?.sourceIp ||
      headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
      headers['x-forwarded-for']?.split(',')[0]?.trim(),
    userAgent: headers['User-Agent'] || headers['user-agent'],
  };
}

export const auditService = {
  recordTenantEvent,
  getAuditEvents,
  extractClientContext,
};
