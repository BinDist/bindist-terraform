/**
 * Single-tenant TTL cleanup handler for Scaleway.
 *
 * Invoked on a schedule by the `ttl_cleanup` function cron. A single-tenant
 * Scaleway deploy keeps all of its tables in one Postgres schema named after
 * the TABLE_PREFIX env var (e.g. "bindist-prod-"), so cleanup is a single
 * call to the generic sweeper against that one schema.
 *
 * On AWS the equivalent expiry is handled natively by DynamoDB TTL, so this
 * handler exists only on the Scaleway/pg path.
 */

import { sweepExpiredRows, TtlSweepResult } from './ttl-sweep.js';

interface CleanupResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function json(statusCode: number, payload: unknown): CleanupResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

export async function handle(
  _event: unknown,
  _context: unknown,
): Promise<CleanupResponse> {
  // Single-tenant tables live bare in `public` (see scaleway/modules/database/
  // schema.sql), exactly how the rest of the single-tenant code queries them.
  // So sweep with no schema; DELETEs use unqualified names via search_path.
  const result: TtlSweepResult = await sweepExpiredRows({ schema: undefined });
  console.log(`TTL cleanup (single-tenant, public schema): ${JSON.stringify(result)}`);
  return json(200, result);
}
