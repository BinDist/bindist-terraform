# Contributing to BinDist

Thanks for your interest in contributing! This guide covers how to set up a dev environment, run checks locally, and open a pull request.

## Project Layout

- `src/` — Shared TypeScript handlers and business logic (runs on both providers)
- `aws/` — AWS Terraform root module + Lambda packaging
- `scaleway/` — Scaleway Terraform root module + DynamoDB-to-SQL adapter
- `environments/` — Per-provider, per-env `.tfvars.example` files
- `tests/` — Python integration test suite
- `scripts/` — PowerShell/bash client and CI scripts

The shared `src/` is built against AWS SDK interfaces and runs unmodified on Scaleway via the adapter in `scaleway/adapter/`.

## Prerequisites

- **Node.js >= 22**
- **Terraform >= 1.6** (only needed if you're touching Terraform)
- **Python 3** (only needed to run integration tests)

## Setup

```bash
npm ci
```

This installs all workspaces (`src/`, `aws/`, `scaleway/`).

## Common Commands

```bash
# Lint shared source
npm run lint -w src

# Run unit tests
npm test -w src

# Build AWS Lambda bundle (also type-checks shared src)
npm run build -w aws

# Build + lint Scaleway adapter
npm run lint -w scaleway
npm run build -w scaleway

# Validate Terraform
cd aws && terraform init -backend=false && terraform validate && terraform fmt -check -recursive
cd scaleway && terraform init -backend=false && terraform validate && terraform fmt -check -recursive
```

CI runs all of the above on every PR — make sure they pass locally before pushing.

## Coding Conventions

- TypeScript strict mode. Path aliases: `@shared/*` → `src/shared/*`, `@functions/*` → `src/functions/*`.
- ESLint allows `any`; unused variables must be prefixed with `_`.
- Terraform formatting is enforced (`terraform fmt -check -recursive`).
- Handlers go in `src/functions/{handlerName}/index.ts` and use the decorators from `src/shared/utils/handlerUtils.ts` (`withAuth`, `withAdmin`, `withAuthAndBody`, `withAdminAndBody`).
- All responses use the standardized envelope from `src/shared/utils/responses.ts`.
- Use Joi schemas in `src/shared/utils/validation.ts` for input validation.

## Pull Requests

1. Fork the repo and create a topic branch (`feature/x`, `fix/y`).
2. Make focused, atomic commits with clear messages.
3. Add or update tests when you change behavior.
4. Run lint, tests, and Terraform validate locally before pushing.
5. Open a PR against `main` describing the change and how to test it.

## Reporting Bugs

Open an issue at https://github.com/BinDist/bindist-terraform/issues with reproduction steps, expected vs actual behavior, and your environment (cloud provider, Node version, Terraform version).

For **security vulnerabilities**, see [SECURITY.md](SECURITY.md) — please do not file public issues for security reports.

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see [LICENSE](LICENSE)).
