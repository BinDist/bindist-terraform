/**
 * Scaleway tenant provisioning helper.
 *
 * Creates a PostgreSQL schema with all per-tenant data plane tables. Used
 * during synchronous tenant provisioning. Reuses the singleton pg pool
 * created by the document-client factory.
 *
 * Translation of DynamoDB DocumentClient commands to PG queries lives in
 * `@bindist/dynamo-to-pg`, plumbed by `src/shared/data/dynamodb.ts`. Nothing
 * else lives here.
 */

import { getPgPool } from '../../src/shared/data/dynamodb.js';

export async function createTenantSchema(tablePrefix: string): Promise<void> {
  const pool = await getPgPool();
  const schema = `"${tablePrefix}"`;

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

  const statements = [
    `CREATE TABLE IF NOT EXISTS ${schema}."customers" ("customerId" TEXT PRIMARY KEY, "name" TEXT, "apiKeyHash" TEXT, "isActive" BOOLEAN DEFAULT true, "isAdmin" BOOLEAN DEFAULT false, "isFinancialAdmin" BOOLEAN DEFAULT false, "createdAt" TEXT, "updatedAt" TEXT, "allowedIpRanges" JSONB, "notes" TEXT, "email" TEXT, "reference" TEXT, "license" TEXT, "parentCustomerId" TEXT, "ttl" BIGINT)`,
    `CREATE TABLE IF NOT EXISTS ${schema}."applications" ("applicationId" TEXT PRIMARY KEY, "name" TEXT, "description" TEXT, "isActive" BOOLEAN DEFAULT true, "createdAt" TEXT, "updatedAt" TEXT, "latestVersion" TEXT, "tags" JSONB, "deletedAt" TEXT)`,
    `CREATE TABLE IF NOT EXISTS ${schema}."customer_applications" ("customerId" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "grantedAt" TEXT, "grantedBy" TEXT, PRIMARY KEY ("customerId", "applicationId"))`,
    `CREATE INDEX IF NOT EXISTS idx_custapp_app ON ${schema}."customer_applications" ("applicationId")`,
    `CREATE TABLE IF NOT EXISTS ${schema}."versions" ("applicationId" TEXT NOT NULL, "version" TEXT NOT NULL, "versionId" TEXT, "releaseNotes" TEXT, "isActive" BOOLEAN DEFAULT true, "isEnabled" BOOLEAN DEFAULT true, "createdAt" TEXT, "updatedAt" TEXT, "fileSize" BIGINT DEFAULT 0, "checksum" TEXT, "downloadCount" BIGINT DEFAULT 0, PRIMARY KEY ("applicationId", "version"))`,
    `CREATE TABLE IF NOT EXISTS ${schema}."application_files" ("versionId" TEXT NOT NULL, "fileId" TEXT NOT NULL, "fileName" TEXT, "fileType" TEXT, "fileSize" BIGINT DEFAULT 0, "checksum" TEXT, "order" INTEGER DEFAULT 0, "description" TEXT, "createdAt" TEXT, PRIMARY KEY ("versionId", "fileId"))`,
    `CREATE TABLE IF NOT EXISTS ${schema}."downloads" ("applicationId" TEXT NOT NULL, "downloadId" TEXT NOT NULL, "customerId" TEXT, "versionId" TEXT, "fileId" TEXT, "clientIp" TEXT, "userAgent" TEXT, "downloadedAt" TEXT, "fileSize" BIGINT, "downloadSource" TEXT, "shareToken" TEXT, "ttl" BIGINT, PRIMARY KEY ("applicationId", "downloadId"))`,
    `CREATE INDEX IF NOT EXISTS idx_dl_customer ON ${schema}."downloads" ("customerId", "downloadedAt")`,
    `CREATE TABLE IF NOT EXISTS ${schema}."uploads" ("applicationId" TEXT NOT NULL, "uploadId" TEXT NOT NULL, "customerId" TEXT, "versionId" TEXT, "version" TEXT, "fileId" TEXT, "fileName" TEXT, "fileSize" BIGINT DEFAULT 0, "checksum" TEXT, "fileType" TEXT, "clientIp" TEXT, "userAgent" TEXT, "uploadedAt" TEXT, "uploadMethod" TEXT, "ipChanged" BOOLEAN, "previousIp" TEXT, "ttl" BIGINT, PRIMARY KEY ("applicationId", "uploadId"))`,
    `CREATE INDEX IF NOT EXISTS idx_ul_customer ON ${schema}."uploads" ("customerId", "uploadedAt")`,
    `CREATE TABLE IF NOT EXISTS ${schema}."api_keys" ("apiKeyHash" TEXT PRIMARY KEY, "customerId" TEXT, "createdAt" TEXT, "name" TEXT, "secret" TEXT, "lastUsedAt" TEXT, "ttl" BIGINT)`,
    `CREATE TABLE IF NOT EXISTS ${schema}."share_tokens" ("token" TEXT PRIMARY KEY, "applicationId" TEXT, "version" TEXT, "fileId" TEXT, "customerId" TEXT, "tablePrefix" TEXT, "s3Prefix" TEXT, "createdAt" TEXT, "expiresAt" TEXT, "ttl" BIGINT)`,
    `CREATE TABLE IF NOT EXISTS ${schema}."audit" ("eventType" TEXT NOT NULL, "eventId" TEXT NOT NULL, "timestamp" TEXT, "ttl" BIGINT, "actor" TEXT, "outcome" TEXT, "signupId" TEXT, "paymentReference" TEXT, "clientIp" TEXT, "userAgent" TEXT, "details" JSONB, PRIMARY KEY ("eventType", "eventId"))`,
    `CREATE INDEX IF NOT EXISTS idx_audit_ts ON ${schema}."audit" ("timestamp")`,
  ];

  for (const stmt of statements) {
    await pool.query(stmt);
  }
}
