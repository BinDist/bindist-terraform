import { describe, test, expect } from 'vitest';
import { responses } from './responses.js';

describe('responses', () => {
  test('success() returns 200 with JSON body and standard headers', () => {
    const result = responses.success({ hello: 'world' });

    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ hello: 'world' });
    expect(body.meta?.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('notFound() returns 404 with error envelope', () => {
    const result = responses.notFound('nope');

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error?.message).toBe('nope');
  });

  test('badRequest() returns 400 and includes details', () => {
    const result = responses.badRequest('bad', { field: 'x' });

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error?.message).toBe('bad');
    expect(body.error?.details).toEqual({ field: 'x' });
  });
});
