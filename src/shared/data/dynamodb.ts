/**
 * DynamoDB document-client factory.
 *
 * Returns either a real `@aws-sdk/lib-dynamodb` `DynamoDBDocumentClient` (AWS)
 * or a `Dynamo2Pg` instance from `@bindist/dynamo-to-pg` (Scaleway), based on
 * the `BACKEND` env var. Both implement the same `.send(command)` interface,
 * so call sites only differ at the construction site (this file).
 *
 * The Scaleway branch lazy-creates a singleton pg pool that other Scaleway-
 * specific code (auth-middleware, tenant provisioning) can also reach via
 * `getPgPool()`.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
// `pg` is loaded lazily inside `getPgPool()` so the AWS deploy doesn't need it
// at runtime (it's a devDep on AWS for type-checking only). The type-only
// import below is erased by tsc and never appears in the emitted JS.
import type PgModule from 'pg';

export interface GSIMeta { pk: string; sk?: string }
export interface TableMeta { pk: string; sk?: string; gsis?: Record<string, GSIMeta>; publicSchema?: boolean }
export type TableConfig = TableMeta & { suffix: string; sqlName?: string };

/**
 * Single source of truth for the BinDist table layout. Used by Dynamo2Pg on
 * Scaleway and by the schema-creation helper for tenant provisioning.
 */
export const TABLES: TableConfig[] = [
  { suffix: 'customers',             pk: 'customerId' },
  { suffix: 'applications',          pk: 'applicationId' },
  { suffix: 'customer-applications', sqlName: 'customer_applications', pk: 'customerId', sk: 'applicationId',
    gsis: { 'applicationId-index': { pk: 'applicationId' } } },
  { suffix: 'versions',              pk: 'applicationId', sk: 'version' },
  { suffix: 'application-files',     sqlName: 'application_files', pk: 'versionId', sk: 'fileId' },
  { suffix: 'downloads',             pk: 'applicationId', sk: 'downloadId',
    gsis: { 'customerId-downloadedAt-index': { pk: 'customerId', sk: 'downloadedAt' } } },
  { suffix: 'uploads',               pk: 'applicationId', sk: 'uploadId',
    gsis: { 'customerId-uploadedAt-index': { pk: 'customerId', sk: 'uploadedAt' } } },
  { suffix: 'api-keys',              sqlName: 'api_keys', pk: 'apiKeyHash' },
  { suffix: 'share-tokens',          sqlName: 'share_tokens', pk: 'token' },
  { suffix: 'audit',                 pk: 'eventType', sk: 'eventId',
    gsis: { 'timestamp-index': { pk: 'timestamp' } } },
];

interface PgPool {
  query(text: string, values?: any[]): Promise<{ rows: any[]; rowCount: number | null }>;
  end(): Promise<void>;
  connect?(): Promise<any>;
}

interface DocClient {
  send(command: any): Promise<any>;
}

const usePg = (): boolean => process.env.BACKEND === 'pg';

let poolPromise: Promise<PgPool> | null = null;
let docClientPromise: Promise<DocClient> | null = null;

/**
 * Lazily create the singleton pg pool. Only meaningful when `BACKEND === 'pg'`
 * — calling it under the AWS backend would error since the AWS deploy doesn't
 * ship `pg`. Guard your callers accordingly.
 */
export async function getPgPool(): Promise<PgPool> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const pg: typeof PgModule = (await import('pg')).default;
      // pg returns BIGINT (OID 20) as a string by default to preserve precision
      // past 2^53. Our BIGINT columns (fileSize, downloadCount, ttl) are
      // declared as `number` in the entity types and never approach
      // Number.MAX_SAFE_INTEGER, so parse them back to numbers to match the
      // original DynamoDB-backed API contract.
      pg.types.setTypeParser(20, (val: string) => (val === null ? null : Number(val)));
      return new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 5,
      });
    })();
  }
  return poolPromise;
}

/**
 * Return the document client appropriate for the active backend. Cached on
 * the module object after first call. Async because the Scaleway path imports
 * `@bindist/dynamo-to-pg` lazily — it's only resolved when actually needed,
 * which keeps cold-start fast on AWS.
 */
export async function getDocumentClient(): Promise<DocClient> {
  if (!docClientPromise) {
    docClientPromise = usePg() ? buildPgClient() : Promise.resolve(buildAwsClient());
  }
  return docClientPromise;
}

function buildAwsClient(): DocClient {
  // `removeUndefinedValues` so callers can pass partial Items without manually
  // stripping `undefined` keys (matches what auditService used to do inline).
  // No-op on the Scaleway path — Dynamo2Pg's PUT translation already ignores
  // missing/null fields.
  return DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

async function buildPgClient(): Promise<DocClient> {
  const [{ Dynamo2Pg }, pool] = await Promise.all([
    import('@bindist/dynamo-to-pg'),
    getPgPool(),
  ]);
  return new Dynamo2Pg({ pool, tables: TABLES }) as DocClient;
}
