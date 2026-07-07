# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BinDist is a serverless binary/application distribution system deployed via Terraform. It supports two cloud providers (AWS and Scaleway) sharing the same handler source code. The API provides customer management, application versioning, pre-signed download URLs, share links, and storage quotas—all behind API key authentication.

## Common Commands

The repo is a single npm workspace (root `package.json` with `workspaces: [src, aws, scaleway]`).
Run `npm ci` **once at the repo root**; it hoists deps for every workspace. Provider
builds compile `src/` themselves via their own `tsconfig.json` (there is no `build`
script in `src/`).

### Build & Lint
```bash
npm ci                      # Install all workspace deps (run at repo root)

npm run build -w aws        # TypeScript compile of src/ using aws/tsconfig.json
npm run build -w scaleway   # TypeScript compile of src/ + scaleway/src adapter
npm run lint -w src         # ESLint the shared source
npm run lint:fix -w src     # ESLint auto-fix

aws/build.sh                # Compile + install prod deps + zip -> aws/function.zip
scaleway/build.sh           # Same, producing scaleway/function.zip
```
Note: a runtime dependency imported from `src/` must also be listed in
`aws/package.json` and `scaleway/package.json` — the deployment zip's `node_modules`
is resolved from the provider manifest, not from `src/package.json`.

### Tests (src/)
Tests run on [Vitest](https://vitest.dev/) (native ESM — matches the `"type": "module"` source).
```bash
npm test -w src                           # Run all tests once (vitest run)
npm run test:watch -w src                 # Watch mode
cd src && npx vitest run path/to/file.test.ts   # Run a single test file
```
Vitest transpiles with esbuild and does not type-check the test run; `tsc` type
errors are caught by the AWS/Scaleway build jobs in CI.

### Scaleway Adapter (scaleway/src/)
The adapter (`scaleway/src/dynamo-to-sql.ts`) is compiled as part of the Scaleway
build above; it has no separate package. Lint it with `npm run lint -w scaleway`.

### Terraform
```bash
# Validate (no credentials needed)
cd aws && terraform init -backend=false && terraform validate && terraform fmt -check -recursive
cd scaleway && terraform init -backend=false && terraform validate && terraform fmt -check -recursive

# Deploy (requires credentials)
aws/deploy.sh [env]              # Build + terraform apply + update Lambda code
scaleway/deploy.sh [env]         # Build adapter + terraform apply + schema migration
```

### Integration Tests (Python)
```bash
cd tests && python3 run_tests.py
```

## Architecture

### Dual-Provider, Shared Source
- **`src/`** — Shared TypeScript handlers and business logic. Written against AWS SDK interfaces.
- **`aws/`** — Terraform root module deploying separate Lambda functions behind API Gateway, with DynamoDB and S3.
- **`scaleway/`** — Terraform root module deploying a single serverless function. The `scaleway/src/` layer translates DynamoDB SDK calls to PostgreSQL and routes all HTTP requests through one entry point.

This means the same `src/` code runs unmodified on both providers. The Scaleway adapter (`dynamo-to-sql.ts`) intercepts DynamoDB SDK operations and converts them to SQL.

### Handler Pattern
Each API endpoint lives in `src/functions/{handlerName}/index.ts`. Handlers use decorator functions from `src/shared/utils/handlerUtils.ts`:

- `withAuth(handler)` — Authenticated request (injects `TenantContext` with customerId, isAdmin, tablePrefix, etc.)
- `withAdmin(handler)` — Admin-only request without body parsing
- `withAdminAndBody<T>(handler)` — Admin-only with parsed JSON body
- `withAuthAndBody<T>(handler)` — Authenticated with parsed JSON body

All responses use the standardized envelope from `src/shared/utils/responses.ts` (`success()`, `error()`, `badRequest()`, `notFound()`, etc.).

### Service Layer
Business logic lives in `src/shared/services/`:
- `multiTenantDynamoService.ts` — DynamoDB CRUD abstraction (the main data access layer)
- `multiTenantS3Service.ts` — S3 operations (upload URLs, download URLs, deletion)
- `multiTenantAuthService.ts` — API key hashing (SHA-256) and extraction
- `quotaEnforcementService.ts` — Storage quota enforcement
- `auditService.ts` — Compliance event logging

### Data Model
Core entities defined in `src/shared/types/entities.ts`: Customer, Application, Version, ApplicationFile, ApiKey, ShareToken, Download/Upload activity records.

### Validation
Uses Joi schemas in `src/shared/utils/validation.ts`.

### ID Generation
- Applications/Customers: string IDs
- Downloads/Uploads: UUIDv4 (`uuid` package)
- Audit events: ULID (`ulid` package, sortable)

## Key Conventions

- TypeScript strict mode with path aliases: `@shared/*` → `src/shared/*`, `@functions/*` → `src/functions/*`
- Node.js >= 22 required (`engines` in every `package.json`)
- ESLint allows `any` types; unused variables must be prefixed with `_`
- Terraform formatting enforced (`terraform fmt -check -recursive`)
- CI (`.github/workflows/ci.yml`) runs the build, lint, test, and terraform-validate jobs in parallel for each provider
