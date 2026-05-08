import * as fs from 'fs';
import * as path from 'path';

/**
 * Build-time script that generates a single API gateway entry point for Scaleway.
 *
 * The entry point imports all handlers, registers them in a Map, and exports
 * a gateway function that routes requests by method + path.
 *
 * Usage: node entry-generator.js <build-dir>
 *
 * Emitted handler.js paths assume the no-flatten BUILD_DIR layout:
 *   - $BUILD_DIR/src/functions/<name>/index.js  (shared handlers)
 *   - $BUILD_DIR/scaleway/src/api-gateway.js    (Scaleway gateway router)
 *
 * The generated file is ESM (matches the BUILD_DIR's `"type": "module"`).
 */

const FUNCTIONS = [
  'listApplications',
  'getApplication',
  'createApplication',
  'deleteApplication',
  'listVersions',
  'listVersionFiles',
  'getDownloadUrl',
  'createShareLink',
  'publicDownload',
  'uploadBinary',
  'getLargeUploadUrl',
  'completeLargeUpload',
  'createApiKey',
  'listCustomers',
  'updateCustomer',
  'regenerateCustomerKey',
  'regenerateAdminKey',
  'regenerateAppsAdminKey',
  'updateApplicationCustomers',
  'getApplicationStats',
  'updateVersion',
  'listActivity',
  'listAuditEvents',
];

function main(): void {
  const buildDir = process.argv[2];
  if (!buildDir) {
    console.error('Usage: node entry-generator.js <build-dir>');
    process.exit(1);
  }

  const resolvedBuildDir = path.resolve(buildDir);
  const funcDir = path.join(resolvedBuildDir, 'functions', 'api-gateway');
  fs.mkdirSync(funcDir, { recursive: true });

  const imports = FUNCTIONS.map(
    (name) => `import { handler as ${name} } from '../../src/functions/${name}/index.js';`
  ).join('\n');

  const registrations = FUNCTIONS.map(
    (name) => `handlers.set('${name}', ${name});`
  ).join('\n  ');

  const entryContent = `import { createGateway } from '../../scaleway/src/api-gateway.js';

${imports}

const handlers = new Map();
  ${registrations}

export const handle = createGateway(handlers);
`;

  const entryPath = path.join(funcDir, 'handler.js');
  fs.writeFileSync(entryPath, entryContent, 'utf-8');
  console.log('Generated: functions/api-gateway/handler.js');
}

main();
