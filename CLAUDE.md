# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BinDist is a serverless binary/application distribution system deployed via Terraform. It supports two cloud providers (AWS and Scaleway) sharing the same handler source code. The API provides customer management, application versioning, pre-signed download URLs, share links, and storage quotas—all behind API key authentication.

## Common Commands

### Build & Lint (src/)
```bash
cd src && npm ci                  # Install dependencies
cd src && npm run build           # TypeScript compile + copy templates
cd src && npm run lint            # ESLint check
cd src && npm run lint:fix        # ESLint auto-fix
cd src && npm run package         # Build + zip for Lambda deployment
```

### Tests (src/)
Tests run on [Vitest](https://vitest.dev/) (native ESM — matches the `"type": "module"` source).
```bash
cd src && npm test                        # Run all tests once (vitest run)
cd src && npm run test:watch              # Watch mode
cd src && npx vitest run path/to/file.test.ts   # Run a single test file
```
Vitest transpiles with esbuild and does not type-check the test run; `tsc` type
errors are caught by the AWS/Scaleway build jobs in CI.

### Scaleway Adapter (scaleway/adapter/)
```bash
cd scaleway/adapter && npm ci && npm run build
cd scaleway/adapter && npm run lint
```

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
- **`scaleway/`** — Terraform root module deploying a single serverless function. The `scaleway/adapter/` layer translates DynamoDB SDK calls to PostgreSQL and routes all HTTP requests through one entry point.

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
- Node.js >= 20 required
- ESLint allows `any` types; unused variables must be prefixed with `_`
- Terraform formatting enforced (`terraform fmt -check -recursive`)
- CI runs four parallel jobs: build-aws, build-scaleway, validate-aws-terraform, validate-scaleway-terraform
