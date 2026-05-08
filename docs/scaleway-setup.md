# Scaleway Provider Setup Guide

This guide walks through the prerequisites and credentials needed to deploy BinDist on Scaleway.

## Prerequisites

Install the following tools:

| Tool | Version | Install |
|------|---------|---------|
| Terraform | >= 1.0 | [terraform.io/downloads](https://www.terraform.io/downloads.html) |
| Node.js | 20.x | [nodejs.org](https://nodejs.org/) |
| npm | (bundled with Node.js) | |
| psql | any | `apt install postgresql-client` or `brew install libpq` |

`psql` is used during deployment to initialize the database schema. If unavailable, the deploy script will print instructions for manual schema application.

## Scaleway Credentials

### 1. Project ID

1. Log in to [console.scaleway.com](https://console.scaleway.com)
2. Navigate to **Project Settings** (top-right menu > Project)
3. Copy the **Project ID** — a UUID like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

### 2. API Keys (Access Key + Secret Key)

1. In the Scaleway console, go to **IAM > API Keys**
2. Click **Generate an API key**
3. Select the project and set the preferred expiration
4. Copy both values:
   - **Access Key** — starts with `SCW`, 20 characters (e.g., `SCWxxxxxxxxxxxxxxxxx`)
   - **Secret Key** — UUID format (e.g., `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

#### Required Permissions

The API key needs access to these Scaleway products:

- **Object Storage** — S3-compatible bucket for binary storage
- **Serverless Functions** — function deployment and execution
- **Serverless SQL Database** — PostgreSQL database for application data

If you are the **Owner** of the Scaleway project, your key already has full access. Otherwise, create an IAM policy granting access to these three products and attach it to your API key's application or user.

### 3. Region

BinDist defaults to `fr-par` (Paris). Available Scaleway regions:

| Region | Location |
|--------|----------|
| `fr-par` | Paris, France (default) |
| `nl-ams` | Amsterdam, Netherlands |
| `pl-waw` | Warsaw, Poland |

Set your preferred region in `terraform.tfvars`. The zone defaults to `{region}-1` (e.g., `fr-par-1`).

## Application Credentials

### Admin API Key (via bootstrap script)

After the first deploy, run the bootstrap script to create the admin user and generate an API key:

```bash
scaleway/bootstrap-admin.sh dev
```

The script will:

1. Connect to the Serverless SQL database
2. Prompt for an admin name
3. Generate a random API key and its SHA-256 hash
4. Insert the admin customer and API key records into the database
5. Print the API key (**save it — it cannot be retrieved later**)

## Configuration

### 1. Create terraform.tfvars

```bash
cp environments/scaleway/dev/terraform.tfvars.example environments/scaleway/dev/terraform.tfvars
```

Edit `environments/scaleway/dev/terraform.tfvars` and fill in:

```hcl
# Core
project_name = "bindist"
environment  = "dev"

# Scaleway
scaleway_project_id = "your-project-id"         # From step 1
scaleway_region     = "fr-par"                   # Your preferred region
scaleway_zone       = "fr-par-1"                 # Matching zone

# Credentials
scaleway_access_key = "SCWxxxxxxxxxxxxxxxxx"     # From step 2
scaleway_secret_key = "xxxxxxxx-xxxx-..."        # From step 2

# Auth
admin_customer_id  = "admin"

# Database
database_min_cpu = 0    # 0 = scale-to-zero (free when idle)
database_max_cpu = 4

# Object Storage
s3_versioning_enabled = true

# Functions
function_memory_limit = 256
function_timeout      = 30
function_min_scale    = 0
function_max_scale    = 5

# Storage Quota
max_bucket_size_gb = 100
```

### 2. (Optional) Create backend.tfvars

By default, Terraform state is stored locally. For remote state on Scaleway Object Storage:

```bash
cp environments/scaleway/dev/backend.tfvars.example environments/scaleway/dev/backend.tfvars
```

Uncomment and configure the S3-compatible backend settings in the file.

## Deploy

### First-time deployment

```bash
# 1. Deploy infrastructure and functions
scaleway/deploy.sh dev

# 2. Create admin user and get an API key
scaleway/bootstrap-admin.sh dev
```

### Subsequent deployments

```bash
scaleway/deploy.sh dev
```

The deploy script will:

1. Build the TypeScript source and Scaleway adapter
2. Create the deployment zip with DynamoDB-to-SQL interception layer
3. Run `terraform init` and `terraform apply` (creates/updates bucket, database, functions)
4. Apply the database schema via `psql` (idempotent — uses `IF NOT EXISTS`)
5. Print all function URLs

## Verify

Test with the admin API key from the bootstrap script:

```bash
# List applications (should return empty array)
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  https://FUNCTION_URL_FOR_listApplications

# Create an application
curl -s -X POST -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "My App", "description": "Test application"}' \
  https://FUNCTION_URL_FOR_createApplication
```

Replace `YOUR_API_KEY` with the raw key (not the hash) and `FUNCTION_URL_FOR_*` with the URLs printed by the deploy script.

## Security Notes

- **Never commit** `terraform.tfvars` or `backend.tfvars` — they are gitignored
- In CI/CD, use `TF_VAR_` environment variables instead of tfvars files:
  ```bash
  export TF_VAR_scaleway_access_key="SCW..."
  export TF_VAR_scaleway_secret_key="..."
  ```
- The Scaleway secret key is passed to functions as a **secret environment variable** (encrypted at rest, not visible in the Scaleway console)
- The `DATABASE_URL` connection string is also a secret environment variable

## Architecture

```
Client
  │
  ▼
Scaleway Serverless Functions (22 functions, public HTTP endpoints)
  │  ├── auth-middleware.ts (Bearer token validation)
  │  ├── scaleway-wrapper.ts (event translation)
  │  └── dynamo-to-sql.ts (DynamoDB SDK → PostgreSQL)
  │
  ├──────────────────────┬────────────────────┐
  ▼                      ▼                    ▼
Serverless SQL      Object Storage       (CloudWatch
(PostgreSQL)        (S3-compatible)       not available)
10 tables            1 bucket
```

DynamoDB SDK calls are intercepted at the Node.js module level and transparently translated to PostgreSQL queries. The shared `src/` code runs unmodified.
