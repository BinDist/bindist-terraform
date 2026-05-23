/**
 * List Customers Lambda Handler
 * GET /v1/management/customers
 *
 * Returns all customers (admin only)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { responses } from '../../shared/utils/responses.js';
import { getTenantContext } from '../../shared/utils/tenantContext.js';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const ctx = getTenantContext(event);
    if (!ctx) {
      return responses.unauthorized('Tenant context not found');
    }

    if (!ctx.isAdmin) {
      return responses.forbidden('Admin access required');
    }

    const customers = await dynamo.listAllCustomers(ctx.tablePrefix);

    // Build response with customer data (no secrets)
    const customersDto = customers
      .filter((c) => !c.isAdmin) // Exclude admin from the list
      .map((c) => ({
        customerId: c.customerId,
        name: c.name,
        isActive: c.isActive,
        createdAt: c.createdAt,
        notes: c.notes,
        email: c.email,
        reference: c.reference,
        license: c.license,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return responses.success({ customers: customersDto });
  } catch (error) {
    console.error('Error listing customers:', error);
    return responses.handleError(error);
  }
};
