import { authenticateRequest } from './auth-middleware.js';

/**
 * Route patterns defining which path parameters each function expects.
 * Parameters are extracted positionally from URL path segments after the
 * function's base URL.
 */
const ROUTE_PATTERNS: Record<string, string[]> = {
  getApplication: ['applicationId'],
  deleteApplication: ['applicationId'],
  listVersions: ['applicationId'],
  listVersionFiles: ['applicationId', 'version'],
  updateVersion: ['applicationId', 'version'],
  getApplicationStats: ['applicationId'],
  updateApplicationCustomers: ['applicationId'],
  publicDownload: ['token'],
  updateCustomer: ['customerId'],
  createApiKey: ['customerId'],
  regenerateCustomerKey: ['customerId'],
};

/** Functions that do not require authentication. */
const PUBLIC_FUNCTIONS = new Set(['publicDownload']);

interface ScalewayEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string>;
  body: string | object | null;
  queryStringParameters: Record<string, string> | null;
}

interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

type LambdaHandler = (event: any, context: any) => Promise<LambdaResponse>;

/**
 * Extract path parameters from the URL based on the function's route pattern.
 * Scaleway Functions URLs look like: https://<domain>/<path-segments>
 * Path parameters are the trailing segments after the base path.
 */
function extractPathParameters(
  path: string,
  functionName: string
): Record<string, string> | null {
  const pattern = ROUTE_PATTERNS[functionName];
  if (!pattern || pattern.length === 0) {
    return null;
  }

  const segments = path.split('/').filter((s) => s.length > 0);
  // Path parameters are the last N segments
  const paramSegments = segments.slice(-pattern.length);

  if (paramSegments.length < pattern.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    params[pattern[i]] = decodeURIComponent(paramSegments[i]);
  }
  return params;
}

/**
 * Translate a Scaleway Functions event into an API Gateway–shaped event,
 * run auth middleware, and call the original Lambda handler.
 */
export function wrapHandler(
  originalHandler: LambdaHandler,
  functionName: string
): (event: ScalewayEvent, context: any) => Promise<LambdaResponse> {
  return async (event: ScalewayEvent, context: any): Promise<LambdaResponse> => {
    // --- Auth ---
    if (!PUBLIC_FUNCTIONS.has(functionName)) {
      const authResult = await authenticateRequest(event.headers || {});
      if (!authResult) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Unauthorized' }),
        };
      }
      // Inject authorizer context so getTenantContext() works
      (event as any).requestContext = { authorizer: authResult };
    } else {
      (event as any).requestContext = {};
    }

    // --- Translate event ---
    const body =
      event.body === null || event.body === undefined
        ? null
        : typeof event.body === 'object'
          ? JSON.stringify(event.body)
          : event.body;

    const apiGatewayEvent = {
      httpMethod: event.httpMethod,
      path: event.path,
      headers: event.headers || {},
      queryStringParameters: event.queryStringParameters || null,
      body,
      isBase64Encoded: false,
      pathParameters: extractPathParameters(event.path || '/', functionName),
      requestContext: (event as any).requestContext,
      resource: '',
      stageVariables: null,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
    };

    // --- Call handler ---
    return originalHandler(apiGatewayEvent, context);
  };
}
