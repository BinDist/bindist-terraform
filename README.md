# BinDist Terraform

Terraform configuration for deploying a serverless application distribution system. Supports multiple cloud providers: **AWS** and **Scaleway**.

## Overview

BinDist is a secure binary/application distribution system that provides:

- **API Key Authentication** — Secure access control for downloads
- **Customer Management** — Manage customers and their application access
- **Version Management** — Track application versions and files
- **Pre-signed URLs** — Secure, time-limited download links
- **Storage Quota** — Configurable bucket size limits
- **Activity Tracking** — Download and upload analytics

Both providers expose an identical REST API. The shared `src/` handlers run unmodified on both — Scaleway uses a DynamoDB-to-SQL adapter that transparently translates all database calls to PostgreSQL.

## Hosted Instance

The official hosted BinDist instance is available at **`https://api.bindist.eu`**. The client scripts in `scripts/` and the Postman collection default to this URL. To use your own self-hosted deployment instead, set the `BINDIST_API_URL` environment variable (or pass `-ApiUrl`) to your API endpoint.

## Quick Start

### AWS

```bash
aws/setup-backend.sh bindist eu-west-1          # 1. State backend (once)
cp environments/aws/dev/*.tfvars.example \
   environments/aws/dev/                         # 2. Configure tfvars
aws/deploy.sh dev                                # 3. Deploy
aws/bootstrap-admin.sh dev                       # 4. Create admin user
```

See [docs/aws-setup.md](docs/aws-setup.md) for the full setup guide (credentials, configuration reference, architecture).

### Scaleway

```bash
cp environments/scaleway/dev/terraform.tfvars.example \
   environments/scaleway/dev/terraform.tfvars    # 1. Configure tfvars
scaleway/deploy.sh dev                           # 2. Deploy
scaleway/bootstrap-admin.sh dev                  # 3. Create admin user
scaleway/deploy.sh dev                           # 4. Re-deploy with admin key hash
```

See [docs/scaleway-setup.md](docs/scaleway-setup.md) for the full setup guide (credentials, configuration reference, architecture).

## API Endpoints

All endpoints are prefixed with `/v1/`. Authenticated endpoints require an `Authorization: Bearer <api-key>` header.

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/downloads/d/{token}` | Download via share link |

### Authenticated

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/applications` | List applications |
| `GET` | `/v1/applications/{id}` | Get application |
| `GET` | `/v1/applications/{id}/stats` | Get statistics |
| `GET` | `/v1/applications/{id}/versions` | List versions |
| `GET` | `/v1/applications/{id}/versions/{v}/files` | List files |
| `GET` | `/v1/downloads/url` | Get download URL |
| `POST` | `/v1/downloads/share` | Create share link |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/management/applications` | Create application |
| `DELETE` | `/v1/management/applications/{id}` | Delete application |
| `PUT` | `/v1/management/applications/{id}/customers` | Update customers |
| `PATCH` | `/v1/applications/{id}/versions/{v}` | Update version |
| `POST` | `/v1/management/upload` | Upload binary |
| `POST` | `/v1/management/upload/large-url` | Start large upload |
| `POST` | `/v1/management/upload/large-complete` | Complete upload |
| `GET` | `/v1/management/customers` | List customers |
| `PATCH` | `/v1/management/customers/{id}` | Update customer |
| `POST` | `/v1/management/customers/{id}/apikeys` | Create API key |
| `POST` | `/v1/management/customers/{id}/regenerate-key` | Regenerate key |
| `POST` | `/v1/management/admin/regenerate-key` | Regenerate admin key |
| `GET` | `/v1/activity` | List activity |
| `GET` | `/v1/audit` | List audit events |

## Client Scripts

PowerShell and bash scripts for managing applications, customers, and CI/CD uploads. See [scripts/README.md](scripts/README.md).

## Postman Collection

A Postman collection for the customer API is available at [docs/postman/BinDist-Customer-API.postman_collection.json](docs/postman/BinDist-Customer-API.postman_collection.json). Import it into Postman and set the `base_url` and `api_key` variables to get started.

## Project Structure

```
aws/                       # AWS Terraform root module
├── modules/               #   API Gateway, DynamoDB, Lambda, Monitoring, S3
├── deploy.sh              #   Build + terraform apply + update Lambda code
├── setup-backend.sh       #   Create S3/DynamoDB state backend
└── bootstrap-admin.sh     #   Create initial admin user
scaleway/                  # Scaleway Terraform root module
├── modules/               #   Functions, Database, Object Storage
├── adapter/               #   API gateway router, auth middleware, DynamoDB-to-SQL
│   ├── api-gateway.ts     #     Request routing + auth dispatch
│   ├── auth-middleware.ts  #     Bearer token validation
│   ├── dynamo-to-sql.ts   #     DynamoDB SDK → PostgreSQL translation
│   ├── entry-generator.ts #     Generates single function entry point
│   └── scaleway-wrapper.ts #    Scaleway serverless function wrapper
├── deploy.sh              #   Build + terraform apply + schema migration
└── bootstrap-admin.sh     #   Create initial admin user
environments/              # Per-provider, per-env tfvars
├── aws/dev/
└── scaleway/dev/
src/                       # Shared handler source code (TypeScript)
scripts/                   # Client and CI/CD scripts (PowerShell/bash)
tests/                     # Integration test suite
docs/                      # Setup guides
```

## License

MIT License — see LICENSE file for details.
