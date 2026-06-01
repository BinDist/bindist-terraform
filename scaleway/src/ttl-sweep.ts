/**
 * Generic TTL row sweeper for Scaleway (Postgres).
 *
 * Several tables carry a `ttl` BIGINT column (unix seconds), a leftover from
 * the DynamoDB design. On AWS that column drives DynamoDB's native TTL expiry,
 * so rows auto-delete with no code. On Scaleway/Postgres there is no native
 * TTL, so this helper performs the equivalent sweep: `DELETE ... WHERE ttl <
 * now`. SQL `NULL < x` is false, so any row that never populated `ttl` is left
 * untouched.
 *
 * Only tables that actually WRITE a ttl are listed below; tables with a
 * vestigial-but-unwritten ttl column (customers, api_keys) are deliberately
 * excluded.
 *
 * Layout-aware so it works for both deployment models:
 *   - Multi-tenant: each tenant's tables live in a schema named after the
 *     tenant's tablePrefix. Pass that schema; DELETEs are schema-qualified.
 *   - Single-tenant: tables live bare in `public`. Omit the schema; DELETEs use
 *     unqualified names and resolve via search_path, matching how the rest of
 *     the single-tenant code (e.g. auth-middleware) queries.
 *
 * Operates on exactly one schema. Any per-tenant iteration (and the per-tenant
 * error isolation) lives in the caller, e.g. the cron worker's cleanupRecords
 * processor.
 *
 * Reuses the singleton pg pool created by the document-client factory.
 */

import { getPgPool } from '../../src/shared/data/dynamodb.js';

// Tables that populate the `ttl` column (unix seconds). Names are the pg
// (sqlName) forms, used directly as identifiers.
const TTL_TABLES = ['downloads', 'uploads', 'share_tokens', 'audit'] as const;

export interface TtlSweepResult {
  rowsDeleted: number;
  byTable: Record<string, number>;
}

export interface SweepOptions {
  /**
   * Schema the tables live in (the tenant's tablePrefix in multi-tenant mode).
   * Set to undefined for single-tenant deploys, where tables are bare in
   * `public`. The field is required so each caller makes the layout explicit.
   */
  schema: string | undefined;
}

/**
 * Delete all rows whose `ttl` (unix seconds) is in the past from every
 * ttl-bearing table.
 */
export async function sweepExpiredRows(
  options: SweepOptions,
): Promise<TtlSweepResult> {
  const pool = await getPgPool();
  const now = Math.floor(Date.now() / 1000);

  // Qualify with the schema when given (multi-tenant). The schema name is a
  // control-plane-generated tablePrefix that never contains a quote, so wrap it
  // so a hyphen is a legal identifier. With no schema (single-tenant), use a
  // bare table name that resolves through search_path to public.
  const qualify = (table: string): string =>
    options.schema ? `"${options.schema}"."${table}"` : `"${table}"`;

  const byTable: Record<string, number> = {};
  let rowsDeleted = 0;

  for (const table of TTL_TABLES) {
    const res = await pool.query(
      `DELETE FROM ${qualify(table)} WHERE "ttl" < $1`,
      [now],
    );
    const n = res.rowCount ?? 0;
    byTable[table] = n;
    rowsDeleted += n;
  }

  return { rowsDeleted, byTable };
}
