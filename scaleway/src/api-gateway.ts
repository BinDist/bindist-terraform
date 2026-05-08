import { authenticateRequest } from './auth-middleware.js';

interface Route {
  method: string;
  segments: string[];
  handlerName: string;
  isPublic: boolean;
}

interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

type Handler = (event: any, context: any) => Promise<LambdaResponse>;

/**
 * Route table ordered by segment count descending so more-specific routes
 * match before less-specific ones.
 */
const ROUTES: Route[] = [
  // 6 segments
  { method: 'GET',    segments: ['v1','applications','{applicationId}','versions','{version}','files'], handlerName: 'listVersionFiles', isPublic: false },
  // 5 segments
  { method: 'PATCH',  segments: ['v1','applications','{applicationId}','versions','{version}'], handlerName: 'updateVersion', isPublic: false },
  { method: 'PUT',    segments: ['v1','management','applications','{applicationId}','customers'], handlerName: 'updateApplicationCustomers', isPublic: false },
  { method: 'POST',   segments: ['v1','management','customers','{customerId}','apikeys'], handlerName: 'createApiKey', isPublic: false },
  { method: 'POST',   segments: ['v1','management','customers','{customerId}','regenerate-key'], handlerName: 'regenerateCustomerKey', isPublic: false },
  // 4 segments
  { method: 'GET',    segments: ['v1','applications','{applicationId}','stats'], handlerName: 'getApplicationStats', isPublic: false },
  { method: 'GET',    segments: ['v1','applications','{applicationId}','versions'], handlerName: 'listVersions', isPublic: false },
  { method: 'DELETE', segments: ['v1','management','applications','{applicationId}'], handlerName: 'deleteApplication', isPublic: false },
  { method: 'GET',    segments: ['v1','downloads','d','{token}'], handlerName: 'publicDownload', isPublic: true },
  { method: 'POST',   segments: ['v1','management','upload','large-url'], handlerName: 'getLargeUploadUrl', isPublic: false },
  { method: 'POST',   segments: ['v1','management','upload','large-complete'], handlerName: 'completeLargeUpload', isPublic: false },
  { method: 'PATCH',  segments: ['v1','management','customers','{customerId}'], handlerName: 'updateCustomer', isPublic: false },
  { method: 'POST',   segments: ['v1','management','admin','regenerate-key'], handlerName: 'regenerateAdminKey', isPublic: false },
  { method: 'POST',   segments: ['v1','management','admin','regenerate-apps-key'], handlerName: 'regenerateAppsAdminKey', isPublic: false },
  // 3 segments
  { method: 'GET',    segments: ['v1','applications','{applicationId}'], handlerName: 'getApplication', isPublic: false },
  { method: 'GET',    segments: ['v1','downloads','url'], handlerName: 'getDownloadUrl', isPublic: false },
  { method: 'POST',   segments: ['v1','downloads','share'], handlerName: 'createShareLink', isPublic: false },
  { method: 'POST',   segments: ['v1','management','applications'], handlerName: 'createApplication', isPublic: false },
  { method: 'POST',   segments: ['v1','management','upload'], handlerName: 'uploadBinary', isPublic: false },
  { method: 'GET',    segments: ['v1','management','customers'], handlerName: 'listCustomers', isPublic: false },
  // 2 segments
  { method: 'GET',    segments: ['v1','applications'], handlerName: 'listApplications', isPublic: false },
  { method: 'GET',    segments: ['v1','activity'], handlerName: 'listActivity', isPublic: false },
  { method: 'GET',    segments: ['v1','audit'], handlerName: 'listAuditEvents', isPublic: false },
];

interface MatchResult {
  route: Route;
  pathParameters: Record<string, string> | null;
}

function matchRoute(method: string, path: string): MatchResult | null {
  const segments = path.split('/').filter((s) => s.length > 0);

  for (const route of ROUTES) {
    if (route.method !== method) continue;
    if (route.segments.length !== segments.length) continue;

    let matched = true;
    const params: Record<string, string> = {};

    for (let i = 0; i < route.segments.length; i++) {
      const pattern = route.segments[i];
      if (pattern.startsWith('{') && pattern.endsWith('}')) {
        // Wildcard — extract parameter value
        const paramName = pattern.slice(1, -1);
        params[paramName] = decodeURIComponent(segments[i]);
      } else if (pattern !== segments[i]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return {
        route,
        pathParameters: Object.keys(params).length > 0 ? params : null,
      };
    }
  }

  return null;
}

/**
 * Create a Scaleway function handler that routes requests to the correct
 * handler based on method + path, running auth centrally.
 */
export function createGateway(
  handlers: Map<string, Handler>
): (event: any, context: any) => Promise<LambdaResponse> {
  return async (event: any, context: any): Promise<LambdaResponse> => {
    const method = event.httpMethod || 'GET';
    const path = event.path || '/';
    const headers = event.headers || {};

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Channel',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
          'Access-Control-Max-Age': '3600',
        },
        body: '',
      };
    }

    const match = matchRoute(method, path);

    if (!match) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: 'Not Found' }),
      };
    }

    const handler = handlers.get(match.route.handlerName);
    if (!handler) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: 'Not Found' }),
      };
    }

    // --- Auth ---
    let authorizer: any = {};
    if (!match.route.isPublic) {
      const authResult = await authenticateRequest(headers);
      if (!authResult) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ message: 'Unauthorized' }),
        };
      }
      authorizer = authResult;
    }

    // --- Build API Gateway-shaped event ---
    const body =
      event.body === null || event.body === undefined
        ? null
        : typeof event.body === 'object'
          ? JSON.stringify(event.body)
          : event.body;

    const host =
      headers['Host'] || headers['host'] ||
      headers['X-Forwarded-Host'] || headers['x-forwarded-host'] ||
      process.env.GATEWAY_DOMAIN || '';

    // Scaleway puts the client IP in X-Forwarded-For (first entry is the originating client).
    // Mirror AWS API Gateway's shape so downstream handlers can keep reading
    // event.requestContext.identity.sourceIp regardless of provider.
    const forwardedFor = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '';
    const sourceIp = forwardedFor.split(',')[0].trim() ||
      headers['x-real-ip'] || headers['X-Real-IP'] || 'unknown';
    const userAgent = headers['user-agent'] || headers['User-Agent'] || '';

    const apiGatewayEvent = {
      httpMethod: method,
      path,
      headers,
      queryStringParameters: event.queryStringParameters || null,
      body,
      isBase64Encoded: false,
      pathParameters: match.pathParameters,
      requestContext: {
        authorizer,
        domainName: host.split(',')[0].trim(),
        stage: '',
        identity: {
          sourceIp,
          userAgent,
        },
      },
      resource: '',
      stageVariables: null,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
    };

    return handler(apiGatewayEvent, context);
  };
}
