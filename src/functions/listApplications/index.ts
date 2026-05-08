/**
 * List Applications Lambda Handler
 * GET /v1/applications
 */

import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { responses } from '../../shared/utils/responses.js';
import { parseListQuery } from '../../shared/utils/validation.js';
import { withAuth, HandlerContext } from '../../shared/utils/handlerUtils.js';
import { ApplicationDto } from '../../shared/types/api.js';

async function listApplicationsHandler({ event, ctx }: HandlerContext) {
  console.log('List applications request', {
    queryParams: event.queryStringParameters,
  });

  const query = parseListQuery(event.queryStringParameters);

  if (ctx.isAdmin) {
    // Admins see all applications with customer info
    const [appResult, customers] = await Promise.all([
      dynamo.listAllApplications(ctx.tablePrefix, query),
      dynamo.listAllCustomers(ctx.tablePrefix),
    ]);

    // Create a map of customerId -> name for quick lookup
    const customerMap = new Map(customers.map((c) => [c.customerId, c.name]));

    const applications: ApplicationDto[] = appResult.applications.map((app) => ({
      applicationId: app.applicationId,
      name: app.name,
      description: app.description,
      isActive: app.isActive,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      tags: app.tags,
      customers: app.customerIds.map((customerId) => ({
        customerId,
        name: customerMap.get(customerId) || 'Unknown',
      })),
    }));

    return responses.success(
      { applications, isAdmin: true, isFinancialAdmin: ctx.isFinancialAdmin },
      200,
      appResult.pagination,
    );
  } else {
    // Regular users only see their own applications
    const result = await dynamo.listApplications(ctx.tablePrefix, ctx.customerId, query);

    const applications: ApplicationDto[] = result.applications.map((app) => ({
      applicationId: app.applicationId,
      name: app.name,
      description: app.description,
      isActive: app.isActive,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      tags: app.tags,
    }));

    return responses.success(
      { applications, isAdmin: false, isFinancialAdmin: false },
      200,
      result.pagination,
    );
  }
}

export const handler = withAuth(listApplicationsHandler);
