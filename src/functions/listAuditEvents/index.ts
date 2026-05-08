/**
 * List Audit Events Lambda
 *
 * GET /v1/audit - List audit events for authenticated tenant
 *
 * Query parameters:
 * - eventType: Filter by event type (e.g., PAYMENT_AUTHORIZED)
 * - startDate: Start date for date range filter (ISO 8601)
 * - endDate: End date for date range filter (ISO 8601)
 * - limit: Max events to return (default 50, max 100)
 * - lastEventId: For pagination (from previous response)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { responses } from '../../shared/utils/responses.js';
import { getControlPlaneAuth } from '../../shared/utils/handlerUtils.js';
import { getAuditEvents } from '../../shared/services/auditService.js';
import { AuditEventType } from '../../shared/types/audit.js';

// Valid event types for validation
const VALID_EVENT_TYPES = Object.values(AuditEventType);

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;
  const path = event.path;

  try {
    if (method === 'GET' && path === '/v1/audit') {
      return handleListAuditEvents(event);
    }

    return responses.notFound('Endpoint not found');
  } catch (error) {
    console.error('List audit events handler error:', error);
    return responses.internalError('Internal server error');
  }
};

async function handleListAuditEvents(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  // Get tenant context from authorizer
  const auth = getControlPlaneAuth(event);
  const tenantId = auth?.tenantId;
  const tablePrefix = auth?.tablePrefix;

  if (!tenantId || !tablePrefix) {
    return responses.unauthorized('Authentication required');
  }

  // Audit events include payment, TOTP, and tenant-lifecycle records —
  // restrict to financial admins.
  if (!auth?.isFinancialAdmin) {
    return responses.forbidden('Audit log access requires financial admin privileges');
  }

  // Parse query parameters
  const queryParams = event.queryStringParameters || {};
  const eventType = queryParams.eventType as AuditEventType | undefined;
  const startDate = queryParams.startDate;
  const endDate = queryParams.endDate;
  const lastEventId = queryParams.lastEventId;
  let limit = parseInt(queryParams.limit || '50', 10);

  // Validate eventType if provided
  if (eventType && !VALID_EVENT_TYPES.includes(eventType)) {
    return responses.badRequest(`Invalid eventType. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
  }

  // Validate limit
  if (isNaN(limit) || limit < 1) {
    limit = 50;
  }
  if (limit > 100) {
    limit = 100;
  }

  // Validate date format if provided
  if (startDate && isNaN(Date.parse(startDate))) {
    return responses.badRequest('Invalid startDate format. Use ISO 8601 format.');
  }
  if (endDate && isNaN(Date.parse(endDate))) {
    return responses.badRequest('Invalid endDate format. Use ISO 8601 format.');
  }

  try {
    const result = await getAuditEvents(tablePrefix, {
      eventType,
      startDate,
      endDate,
      limit,
      lastEventId,
    });

    return responses.success({
      events: result.events,
      pagination: {
        hasMore: result.hasMore,
        lastEventId: result.lastEventId,
      },
    });
  } catch (error) {
    console.error(`Failed to list audit events for tenant ${tenantId}:`, error);
    return responses.internalError('Failed to retrieve audit events');
  }
}
