/**
 * Tests for the handler decorators in handlerUtils.ts.
 *
 * Every API endpoint is wrapped in one of these decorators (withAuth,
 * withAdmin, withAuthAndBody, ...). The decorator is the gate that runs
 * before the endpoint's own code: it reads the caller's identity from the
 * API Gateway authorizer context, rejects callers who lack the required
 * role, parses the JSON body (for the `*AndBody` variants), and turns thrown
 * errors into clean HTTP responses. A bug in a gate is a bug in every
 * endpoint that uses it, so they're worth testing on their own.
 *
 * Authentication happens upstream in a separate Lambda authorizer, which
 * attaches what it learned (tenant id, role flags) to
 * `event.requestContext.authorizer`. These tests never touch a real API
 * Gateway — `makeEvent({ authorizer })` fakes that context, i.e. "pretend
 * the authorizer already decided the caller looks like this". Three caller
 * roles are exercised: a plain user, an admin, and a financial admin (the
 * highest tier, which is also an admin).
 */

import { describe, test, expect, vi, beforeAll, afterAll, type MockInstance } from 'vitest';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  getControlPlaneAuth,
  withAuth,
  withAdmin,
  withAuthAndBody,
  withAdminAndBody,
  withFinancialAdmin,
  withFinancialAdminAndBody,
} from './handlerUtils.js';

/** The only event fields the handler utilities actually read. */
interface EventOpts {
  authorizer?: Record<string, unknown> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
}

function makeEvent(opts: EventOpts = {}): APIGatewayProxyEvent {
  const { authorizer = null, body = null, isBase64Encoded = false } = opts;
  return {
    body,
    isBase64Encoded,
    requestContext: { authorizer },
  } as unknown as APIGatewayProxyEvent;
}

// A stand-in endpoint: always 200, and a vi.fn() so tests can assert it
// was (or wasn't) reached and inspect the ctx/body it received. Typed `any`
// so one stub fits every decorator shape.
function okHandler() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return vi.fn(async (_context: any): Promise<APIGatewayProxyResult> => ({
    statusCode: 200,
    body: 'ok',
  }));
}

// getTenantContext requires all four identity fields, and reads the role
// flags as the strings 'true'/'false' (API Gateway stringifies them).
const baseAuth = { tenantId: 't1', tablePrefix: 'tp_', s3Prefix: 's3p', customerId: 'c1', tier: 'Pro' };
const userAuth = { ...baseAuth, isAdmin: 'false', isFinancialAdmin: 'false' };
const adminAuth = { ...baseAuth, isAdmin: 'true', isFinancialAdmin: 'false' };
const financialAuth = { ...baseAuth, isAdmin: 'true', isFinancialAdmin: 'true' };

function errorOf(result: APIGatewayProxyResult): { code?: string; message?: string } {
  return JSON.parse(result.body).error ?? {};
}

// Silence the console.error/warn the failure paths log on purpose.
let errorSpy: MockInstance;
let warnSpy: MockInstance;
beforeAll(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => {
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

describe('getControlPlaneAuth', () => {
  test('returns null when there is no authorizer context', () => {
    expect(getControlPlaneAuth(makeEvent({ authorizer: null }))).toBeNull();
    expect(getControlPlaneAuth(makeEvent({ authorizer: undefined }))).toBeNull();
  });

  test('normalizes string-serialized booleans to real booleans', () => {
    const auth = getControlPlaneAuth(makeEvent({ authorizer: adminAuth }));
    expect(auth?.isAdmin).toBe(true);
    expect(auth?.isFinancialAdmin).toBe(false);
  });

  test('accepts genuine boolean values too', () => {
    const auth = getControlPlaneAuth(
      makeEvent({ authorizer: { ...baseAuth, isAdmin: true, isFinancialAdmin: true } })
    );
    expect(auth?.isAdmin).toBe(true);
    expect(auth?.isFinancialAdmin).toBe(true);
  });

  test('treats missing or non-"true" flags as false (default deny)', () => {
    // The security-relevant rule: anything that isn't exactly true/'true'
    // must NOT grant the role (here a stray 'yes' and an absent flag).
    const auth = getControlPlaneAuth(
      makeEvent({ authorizer: { ...baseAuth, isAdmin: 'yes', isFinancialAdmin: undefined } })
    );
    expect(auth?.isAdmin).toBe(false);
    expect(auth?.isFinancialAdmin).toBe(false);
  });

  test('passes through tenant identity fields', () => {
    const auth = getControlPlaneAuth(makeEvent({ authorizer: financialAuth }));
    expect(auth).toMatchObject({ tenantId: 't1', customerId: 'c1', tablePrefix: 'tp_', s3Prefix: 's3p', tier: 'Pro' });
  });
});

describe('withAuth', () => {
  test('401 when no tenant context is present', async () => {
    const handler = okHandler();
    const endpoint = withAuth(handler);

    const result = await endpoint(makeEvent({ authorizer: null }));

    expect(result.statusCode).toBe(401);
    expect(errorOf(result).code).toBe('UNAUTHORIZED');
    expect(handler).not.toHaveBeenCalled();
  });

  test('401 when required tenant fields are missing', async () => {
    const handler = okHandler();
    const endpoint = withAuth(handler);

    // A partial context (no customerId) is treated as no context at all — a
    // half-formed identity must not be accepted.
    const result = await endpoint(makeEvent({ authorizer: { tenantId: 't1', tablePrefix: 'tp_', s3Prefix: 's3p' } }));

    expect(result.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  test('invokes the handler with a populated tenant context', async () => {
    const handler = okHandler();
    const endpoint = withAuth(handler);

    const result = await endpoint(makeEvent({ authorizer: userAuth }));

    expect(result.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].ctx).toMatchObject({
      tenantId: 't1',
      customerId: 'c1',
      tablePrefix: 'tp_',
      isAdmin: false,
      isFinancialAdmin: false,
      tier: 'Pro',
    });
  });

  test('converts a thrown handler error into a 500 envelope', async () => {
    // The gate must catch endpoint errors and return a standardized 500,
    // not leak the raw error.
    const handler = vi.fn(async () => {
      throw new Error('boom');
    });
    const endpoint = withAuth(handler);

    const result = await endpoint(makeEvent({ authorizer: userAuth }));

    expect(result.statusCode).toBe(500);
    expect(errorOf(result).code).toBe('INTERNAL_ERROR');
  });
});

describe('withAdmin', () => {
  test('401 when no tenant context', async () => {
    const handler = okHandler();
    const endpoint = withAdmin(handler);

    const result = await endpoint(makeEvent({ authorizer: null }));

    expect(result.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  test('403 when authenticated but not an admin', async () => {
    const handler = okHandler();
    const endpoint = withAdmin(handler);

    const result = await endpoint(makeEvent({ authorizer: userAuth }));

    expect(result.statusCode).toBe(403);
    expect(errorOf(result).code).toBe('FORBIDDEN');
    expect(handler).not.toHaveBeenCalled();
  });

  test('invokes the handler for an admin', async () => {
    const handler = okHandler();
    const endpoint = withAdmin(handler);

    const result = await endpoint(makeEvent({ authorizer: adminAuth }));

    expect(result.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('withAuthAndBody', () => {
  test('401 when no tenant context, before any body parsing', async () => {
    const handler = okHandler();
    const endpoint = withAuthAndBody(handler);

    const result = await endpoint(makeEvent({ authorizer: null, body: null }));

    expect(result.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  test('400 when the body is missing', async () => {
    const handler = okHandler();
    const endpoint = withAuthAndBody(handler);

    const result = await endpoint(makeEvent({ authorizer: userAuth, body: null }));

    expect(result.statusCode).toBe(400);
    expect(errorOf(result).message).toMatch(/body is required/i);
    expect(handler).not.toHaveBeenCalled();
  });

  test('400 when the body is not valid JSON', async () => {
    const handler = okHandler();
    const endpoint = withAuthAndBody(handler);

    const result = await endpoint(makeEvent({ authorizer: userAuth, body: '{not json' }));

    expect(result.statusCode).toBe(400);
    expect(errorOf(result).message).toMatch(/invalid json/i);
    expect(handler).not.toHaveBeenCalled();
  });

  test('parses the JSON body and passes it to the handler', async () => {
    const handler = okHandler();
    const endpoint = withAuthAndBody<{ name: string }>(handler);

    const result = await endpoint(makeEvent({ authorizer: userAuth, body: JSON.stringify({ name: 'widget' }) }));

    expect(result.statusCode).toBe(200);
    expect(handler.mock.calls[0][0].body).toEqual({ name: 'widget' });
  });

  test('decodes a base64-encoded body', async () => {
    const handler = okHandler();
    const endpoint = withAuthAndBody<{ name: string }>(handler);
    // API Gateway can deliver the body base64-encoded with isBase64Encoded
    // set; the gate must decode before parsing.
    const encoded = Buffer.from(JSON.stringify({ name: 'b64' })).toString('base64');

    await endpoint(makeEvent({ authorizer: userAuth, body: encoded, isBase64Encoded: true }));

    expect(handler.mock.calls[0][0].body).toEqual({ name: 'b64' });
  });
});

describe('withAdminAndBody', () => {
  test('checks admin access before parsing the body', async () => {
    const handler = okHandler();
    const endpoint = withAdminAndBody(handler);

    // Non-admin AND no body. If the body were checked first this would be a
    // 400; failing closed means 403. Asserting 403 pins the privilege check
    // ahead of body parsing, so a non-admin can't probe an admin route.
    const result = await endpoint(makeEvent({ authorizer: userAuth, body: null }));

    expect(result.statusCode).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  test('invokes the handler for an admin with a valid body', async () => {
    const handler = okHandler();
    const endpoint = withAdminAndBody<{ x: number }>(handler);

    const result = await endpoint(makeEvent({ authorizer: adminAuth, body: JSON.stringify({ x: 1 }) }));

    expect(result.statusCode).toBe(200);
    expect(handler.mock.calls[0][0].body).toEqual({ x: 1 });
  });
});

describe('withFinancialAdmin', () => {
  test('403 for a plain admin who is not a financial admin', async () => {
    const handler = okHandler();
    const endpoint = withFinancialAdmin(handler);

    // The privilege boundary: passing withAdmin is NOT enough here. This is
    // what keeps the apps-admin tier out of financial operations.
    const result = await endpoint(makeEvent({ authorizer: adminAuth }));

    expect(result.statusCode).toBe(403);
    expect(errorOf(result).message).toMatch(/financial admin/i);
    expect(handler).not.toHaveBeenCalled();
  });

  test('invokes the handler for a financial admin', async () => {
    const handler = okHandler();
    const endpoint = withFinancialAdmin(handler);

    const result = await endpoint(makeEvent({ authorizer: financialAuth }));

    expect(result.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('withFinancialAdminAndBody', () => {
  test('checks financial-admin access before parsing the body', async () => {
    const handler = okHandler();
    const endpoint = withFinancialAdminAndBody(handler);

    // Same ordering guarantee as withAdminAndBody: a plain admin with no
    // body must get 403 (privilege check wins), not 400.
    const result = await endpoint(makeEvent({ authorizer: adminAuth, body: null }));

    expect(result.statusCode).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  test('invokes the handler for a financial admin with a valid body', async () => {
    const handler = okHandler();
    const endpoint = withFinancialAdminAndBody<{ ok: boolean }>(handler);

    const result = await endpoint(makeEvent({ authorizer: financialAuth, body: JSON.stringify({ ok: true }) }));

    expect(result.statusCode).toBe(200);
    expect(handler.mock.calls[0][0].body).toEqual({ ok: true });
  });
});
