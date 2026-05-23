/**
 * List Version Files Lambda Handler
 * GET /v1/applications/{applicationId}/versions/{version}/files
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as dynamo from '../../shared/services/multiTenantDynamoService.js';
import { responses } from '../../shared/utils/responses.js';
import { getTenantContext } from '../../shared/utils/tenantContext.js';
import { ApplicationFileDto } from '../../shared/types/api.js';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const applicationId = event.pathParameters?.applicationId;
  const version = event.pathParameters?.version;

  try {
    const ctx = getTenantContext(event);
    if (!ctx) {
      return responses.unauthorized('Tenant context not found');
    }

    if (!applicationId || !version) {
      return responses.badRequest('Application ID and version are required');
    }

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

    // Get files for this version
    const versionId = `${applicationId}-${version}`;
    const files = await dynamo.listVersionFiles(ctx.tablePrefix, versionId);

    const fileDtos: ApplicationFileDto[] = files.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      fileType: f.fileType,
      fileSize: f.fileSize,
      checksum: f.checksum,
      order: f.order,
      description: f.description,
    }));

    return responses.success({
      applicationId,
      version,
      files: fileDtos,
    });
  } catch (error) {
    console.error('Error listing version files:', error);
    return responses.handleError(error);
  }
};
