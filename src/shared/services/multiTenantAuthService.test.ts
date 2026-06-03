/**
 * Tests for API-key generation and hashing.
 *
 * The security-critical invariant is the round-trip: a generated key's
 * stored hash must be exactly hashSecret(secret), because the authorizer
 * authenticates a caller by hashing the secret they present and comparing
 * it to the stored hash. If generation and verification ever disagree,
 * every key either fails to authenticate or (worse) the comparison is
 * meaningless — so this is worth proving directly.
 */

import { describe, test, expect, vi } from 'vitest';

// hashSecret/generateApiKey are pure, but the module imports the DynamoDB
// data layer for its (untested-here) persistence helper. Stub it so the
// suite doesn't load the pg/Dynamo stack just to hash a string.
vi.mock('../data/dynamodb.js', () => ({ getDocumentClient: vi.fn() }));

import { hashSecret, generateApiKey } from './multiTenantAuthService.js';

describe('hashSecret', () => {
  test('is a stable, lowercase-hex SHA-256 digest', () => {
    // Known vector: SHA-256("abc").
    expect(hashSecret('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('is deterministic for the same input', () => {
    expect(hashSecret('same-secret')).toBe(hashSecret('same-secret'));
  });

  test('differs for different inputs', () => {
    expect(hashSecret('secret-a')).not.toBe(hashSecret('secret-b'));
  });
});

describe('generateApiKey', () => {
  test('formats the key as {tenantId}.{secret}', () => {
    const { apiKey, secret } = generateApiKey('tenant-123');
    expect(apiKey).toBe(`tenant-123.${secret}`);
    // The secret is recoverable as everything after the first dot, which is
    // how the authorizer splits an incoming key.
    expect(apiKey.slice(apiKey.indexOf('.') + 1)).toBe(secret);
  });

  test('stored hash equals hashSecret(secret) — the auth round-trip', () => {
    const { secret, apiKeyHash } = generateApiKey('tenant-123');
    expect(apiKeyHash).toBe(hashSecret(secret));
  });

  test('secret is URL-safe base64 (no padding or +/ characters)', () => {
    // The key travels in headers and share URLs, so the secret must not
    // contain characters that need escaping. 32 random bytes -> 43 chars.
    const { secret } = generateApiKey('t');
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(secret).toHaveLength(43);
  });

  test('produces a fresh, unique secret each call', () => {
    const a = generateApiKey('t');
    const b = generateApiKey('t');
    expect(a.secret).not.toBe(b.secret);
    expect(a.apiKeyHash).not.toBe(b.apiKeyHash);
  });
});
