/**
 * Lambda Handler Utilities
 * Common patterns for API Gateway Lambda handlers
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TenantContext, getTenantContext } from './tenantContext.js';
import { responses } from './responses.js';

/**
 * Raw authorizer context as it arrives from API Gateway.
 *
 * API Gateway serializes every authorizer context value to a string
 * before handing it to downstream Lambdas, so booleans arrive as the
 * literal strings `'true'` / `'false'`. We keep this type internal so
 * callers cannot accidentally consume the untyped form.
 */
interface RawControlPlaneAuthorizerContext {
  isAdmin?: string | boolean;
  isFinancialAdmin?: string | boolean;
  tenantId?: string;
  customerId?: string;
  tablePrefix?: string;
  s3Prefix?: string;
  tier?: string;
}

/**
 * Parsed control plane auth with real types.
 *
 * `isAdmin` is true for both admin tiers (apps-admin + financial admin).
 * `isFinancialAdmin` is the strictly higher tier — gates billing,
 * control-plane lifecycle, and TOTP operations.
 */
export interface ControlPlaneAuth {
  tenantId?: string;
  customerId?: string;
  tablePrefix?: string;
  s3Prefix?: string;
  tier?: string;
  isAdmin: boolean;
  isFinancialAdmin: boolean;
}

/**
 * Extract and parse control plane authorizer context from an API Gateway
 * event. Normalizes the string-serialized values into real types.
 *
 * Returns null if the event has no authorizer context at all.
 */
export function getControlPlaneAuth(event: APIGatewayProxyEvent): ControlPlaneAuth | null {
  const raw = event.requestContext.authorizer as RawControlPlaneAuthorizerContext | null | undefined;
  if (!raw) return null;
  return {
    tenantId: raw.tenantId,
    customerId: raw.customerId,
    tablePrefix: raw.tablePrefix,
    s3Prefix: raw.s3Prefix,
    tier: raw.tier,
    isAdmin: raw.isAdmin === true || raw.isAdmin === 'true',
    isFinancialAdmin: raw.isFinancialAdmin === true || raw.isFinancialAdmin === 'true',
  };
}

/**
 * Handler context provided to wrapped handlers
 */
export interface HandlerContext {
  event: APIGatewayProxyEvent;
  ctx: TenantContext;
}

/**
 * Admin handler context - same as HandlerContext but guarantees isAdmin is true
 */
export interface AdminHandlerContext extends HandlerContext {
  ctx: TenantContext & { isAdmin: true };
}

/**
 * Financial-admin handler context - guarantees isFinancialAdmin is true.
 * A financial admin is always also an isAdmin.
 */
export interface FinancialAdminHandlerContext extends HandlerContext {
  ctx: TenantContext & { isAdmin: true; isFinancialAdmin: true };
}

/**
 * Handler context with parsed JSON body
 */
export interface HandlerContextWithBody<T> extends HandlerContext {
  body: T;
}

/**
 * Admin handler context with parsed JSON body
 */
export interface AdminHandlerContextWithBody<T> extends AdminHandlerContext {
  body: T;
}

/**
 * Financial-admin handler context with parsed JSON body
 */
export interface FinancialAdminHandlerContextWithBody<T> extends FinancialAdminHandlerContext {
  body: T;
}

/**
 * Handler function type for authenticated requests
 */
type AuthenticatedHandler = (context: HandlerContext) => Promise<APIGatewayProxyResult>;

/**
 * Handler function type for admin-only requests
 */
type AdminHandler = (context: AdminHandlerContext) => Promise<APIGatewayProxyResult>;

/**
 * Handler function type for financial-admin-only requests
 */
type FinancialAdminHandler = (context: FinancialAdminHandlerContext) => Promise<APIGatewayProxyResult>;

/**
 * Handler function type for requests with JSON body
 */
type BodyHandler<T> = (context: HandlerContextWithBody<T>) => Promise<APIGatewayProxyResult>;

/**
 * Handler function type for admin requests with JSON body
 */
type AdminBodyHandler<T> = (context: AdminHandlerContextWithBody<T>) => Promise<APIGatewayProxyResult>;

/**
 * Handler function type for financial-admin requests with JSON body
 */
type FinancialAdminBodyHandler<T> = (context: FinancialAdminHandlerContextWithBody<T>) => Promise<APIGatewayProxyResult>;

/**
 * Wrap a handler that requires authentication
 * Handles tenant context extraction and error responses
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      const ctx = getTenantContext(event);
      if (!ctx) {
        return responses.unauthorized('Tenant context not found');
      }
      return await handler({ event, ctx });
    } catch (error) {
      console.error('Handler error:', error);
      return responses.handleError(error);
    }
  };
}

/**
 * Wrap a handler that requires admin access
 * Handles tenant context extraction, admin check, and error responses
 */
export function withAdmin(handler: AdminHandler) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      const ctx = getTenantContext(event);
      if (!ctx) {
        return responses.unauthorized('Tenant context not found');
      }
      if (!ctx.isAdmin) {
        return responses.forbidden('Admin access required');
      }
      return await handler({ event, ctx: ctx as TenantContext & { isAdmin: true } });
    } catch (error) {
      console.error('Handler error:', error);
      return responses.handleError(error);
    }
  };
}

/**
 * Wrap a handler that requires authentication and a JSON body
 */
export function withAuthAndBody<T>(handler: BodyHandler<T>) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      const ctx = getTenantContext(event);
      if (!ctx) {
        return responses.unauthorized('Tenant context not found');
      }

      const parseResult = parseJsonBody<T>(event);
      if ('error' in parseResult) {
        return parseResult.error;
      }

      return await handler({ event, ctx, body: parseResult.body });
    } catch (error) {
      console.error('Handler error:', error);
      return responses.handleError(error);
    }
  };
}

/**
 * Wrap a handler that requires admin access and a JSON body
 */
export function withAdminAndBody<T>(handler: AdminBodyHandler<T>) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      const ctx = getTenantContext(event);
      if (!ctx) {
        return responses.unauthorized('Tenant context not found');
      }
      if (!ctx.isAdmin) {
        return responses.forbidden('Admin access required');
      }

      const parseResult = parseJsonBody<T>(event);
      if ('error' in parseResult) {
        return parseResult.error;
      }

      return await handler({ event, ctx: ctx as TenantContext & { isAdmin: true }, body: parseResult.body });
    } catch (error) {
      console.error('Handler error:', error);
      return responses.handleError(error);
    }
  };
}

/**
 * Wrap a handler that requires financial-admin access.
 * Use for billing, tenant-lifecycle (control plane), and TOTP operations
 * that the restricted apps-admin tier must not reach.
 */
export function withFinancialAdmin(handler: FinancialAdminHandler) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      const ctx = getTenantContext(event);
      if (!ctx) {
        return responses.unauthorized('Tenant context not found');
      }
      if (!ctx.isFinancialAdmin) {
        return responses.forbidden('Financial admin access required');
      }
      return await handler({
        event,
        ctx: ctx as TenantContext & { isAdmin: true; isFinancialAdmin: true },
      });
    } catch (error) {
      console.error('Handler error:', error);
      return responses.handleError(error);
    }
  };
}

/**
 * Wrap a handler that requires financial-admin access and a JSON body.
 */
export function withFinancialAdminAndBody<T>(handler: FinancialAdminBodyHandler<T>) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      const ctx = getTenantContext(event);
      if (!ctx) {
        return responses.unauthorized('Tenant context not found');
      }
      if (!ctx.isFinancialAdmin) {
        return responses.forbidden('Financial admin access required');
      }

      const parseResult = parseJsonBody<T>(event);
      if ('error' in parseResult) {
        return parseResult.error;
      }

      return await handler({
        event,
        ctx: ctx as TenantContext & { isAdmin: true; isFinancialAdmin: true },
        body: parseResult.body,
      });
    } catch (error) {
      console.error('Handler error:', error);
      return responses.handleError(error);
    }
  };
}

/**
 * Parse JSON body from API Gateway event
 * Returns parsed body or error response
 */
function parseJsonBody<T>(event: APIGatewayProxyEvent): { body: T } | { error: APIGatewayProxyResult } {
  if (!event.body) {
    return { error: responses.badRequest('Request body is required') };
  }

  try {
    const bodyString = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString()
      : event.body;
    const body = JSON.parse(bodyString) as T;
    return { body };
  } catch {
    return { error: responses.badRequest('Invalid JSON in request body') };
  }
}
