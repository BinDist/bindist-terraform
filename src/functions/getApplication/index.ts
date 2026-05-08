/**
 * Get Application Lambda Handler
 * GET /v1/applications/{applicationId}
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { responses } from '../../shared/utils/responses.js';
import { getTenantContext } from '../../shared/utils/tenantContext.js';
import { ApplicationDto } from '../../shared/types/api.js';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const applicationId = event.pathParameters?.applicationId;

  console.log('Get application request', { applicationId });

  try {
    const ctx = getTenantContext(event);
    if (!ctx) {
      return responses.unauthorized('Tenant context not found');
    }

    if (!applicationId) {
      return responses.badRequest('Application ID is required');
    }

    // Get the application
    const application = await dynamo.getApplication(ctx.tablePrefix, applicationId);

    if (!application) {
      return responses.notFound(`Application '${applicationId}' not found`);
    }

    // Check access for non-admin users
    if (!ctx.isAdmin) {
      const hasAccess = await dynamo.hasApplicationAccess(ctx.tablePrefix, ctx.customerId, applicationId);
      if (!hasAccess) {
        return responses.notFound(`Application '${applicationId}' not found`);
      }
    }

    const dto: ApplicationDto = {
      applicationId: application.applicationId,
      name: application.name,
      description: application.description,
      isActive: application.isActive,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      tags: application.tags,
    };

    return responses.success(dto);
  } catch (error) {
    console.error('Error getting application:', error);
    return responses.handleError(error);
  }
};
