# AWS Provider Setup Guide

This guide walks through the prerequisites, credentials, and deployment process for BinDist on AWS.

## Prerequisites

Install the following tools:

| Tool | Version | Install |
|------|---------|---------|
| Terraform | >= 1.0 | [terraform.io/downloads](https://www.terraform.io/downloads.html) |
| AWS CLI | v2 | [aws.amazon.com/cli](https://aws.amazon.com/cli/) |
| Node.js | 20.x | [nodejs.org](https://nodejs.org/) |
| npm | (bundled with Node.js) | |
| jq | any | `apt install jq` or `brew install jq` |
| openssl | any | Pre-installed on most systems |

## AWS Credentials

### 1. IAM User or Role

Create an IAM user (or assume a role) with the following permissions:

- **Lambda** — create/update functions, manage layers and permissions
- **API Gateway** — create/manage REST APIs, stages, and deployments
- **DynamoDB** — create tables, read/write items
- **S3** — create buckets, put/get objects, manage lifecycle rules
- **CloudWatch** — create log groups, put metrics, manage alarms
- **SNS** — create topics and subscriptions (for alerts)
- **IAM** — create roles and policies for Lambda execution
- **X-Ray** — write trace segments (if X-Ray is enabled)

For development, the **AdministratorAccess** managed policy works. For production, scope permissions down to the resources created by Terraform.

### 2. Configure AWS CLI

```bash
aws configure
# Enter your Access Key ID, Secret Access Key, and region
```

Or use environment variables:

```bash
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_DEFAULT_REGION="eu-west-1"
```

Verify your credentials:

```bash
aws sts get-caller-identity
```

### 3. Region

BinDist defaults to `eu-west-1` (Ireland). Set `aws_region` in your `terraform.tfvars` to any region that supports all required services.

## Terraform State Backend

Terraform state must be stored remotely for team collaboration and safety. Run the backend setup script **once** before the first deployment:

```bash
aws/setup-backend.sh [project-name] [region]
# Example:
aws/setup-backend.sh bindist eu-west-1
```

This creates:

- **S3 bucket** (`bindist-terraform-state`) — versioned, encrypted, with public access blocked
- **DynamoDB table** (`bindist-terraform-locks`) — for state locking

After the script completes, create the backend config file:

```bash
cp environments/aws/dev/backend.tfvars.example environments/aws/dev/backend.tfvars
```

Edit `environments/aws/dev/backend.tfvars`:

```hcl
bucket         = "bindist-terraform-state"
key            = "dev/terraform.tfstate"
region         = "eu-west-1"
dynamodb_table = "bindist-terraform-locks"
encrypt        = true
```

> **Note:** The setup script prints the exact values to use.

## Configuration

### Create terraform.tfvars

```bash
cp environments/aws/dev/terraform.tfvars.example environments/aws/dev/terraform.tfvars
```

Edit `environments/aws/dev/terraform.tfvars`:

```hcl
# Core
project_name = "bindist"
environment  = "dev"
aws_region   = "eu-west-1"

# DynamoDB
dynamodb_billing_mode           = "PAY_PER_REQUEST"
dynamodb_point_in_time_recovery = false   # Enable for production

# S3
s3_versioning_enabled     = true
s3_lifecycle_glacier_days = 90   # Days before old versions move to Glacier

# Lambda
lambda_runtime     = "nodejs20.x"
lambda_memory_size = 256
lambda_timeout     = 30
enable_xray        = true

# API Gateway
api_throttling_rate_limit  = 100   # Requests per second
api_throttling_burst_limit = 200

# Monitoring
alert_email        = ""   # Set to receive CloudWatch alerts
log_retention_days = 30

# Storage Quota
max_bucket_size_gb = 100

# Share Links
share_link_default_ttl_minutes = 10080   # 7 days
share_link_max_ttl_minutes     = 86400   # 60 days
```

### Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `project_name` | `bindist` | Prefix for all resource names |
| `environment` | — | Environment name (`dev`, `prod`) |
| `aws_region` | `eu-west-1` | AWS region |
| `dynamodb_billing_mode` | `PAY_PER_REQUEST` | `PAY_PER_REQUEST` or `PROVISIONED` |
| `dynamodb_point_in_time_recovery` | `false` | Enable DynamoDB PITR backups |
| `s3_versioning_enabled` | `true` | Enable S3 bucket versioning |
| `s3_lifecycle_glacier_days` | `90` | Days before Glacier transition (0 to disable) |
| `lambda_runtime` | `nodejs20.x` | Lambda runtime |
| `lambda_memory_size` | `256` | Lambda memory in MB |
| `lambda_timeout` | `30` | Lambda timeout in seconds |
| `enable_xray` | `true` | Enable X-Ray tracing |
| `api_throttling_rate_limit` | `100` | API Gateway rate limit (req/s) |
| `api_throttling_burst_limit` | `200` | API Gateway burst limit |
| `alert_email` | `""` | Email for CloudWatch alerts |
| `log_retention_days` | `30` | CloudWatch log retention in days |
| `max_bucket_size_gb` | `100` | Storage quota in GB |
| `share_link_default_ttl_minutes` | `10080` | Default share link TTL (7 days) |
| `share_link_max_ttl_minutes` | `86400` | Max share link TTL (60 days) |

## Deploy

### First-time deployment

```bash
# 1. Set up Terraform state backend (once)
aws/setup-backend.sh bindist eu-west-1

# 2. Create backend.tfvars and terraform.tfvars (see above)

# 3. Deploy infrastructure and Lambda code
aws/deploy.sh dev

# 4. Create initial admin user
aws/bootstrap-admin.sh dev
```

Save the API key printed by the bootstrap script — **it cannot be retrieved later**.

### Subsequent deployments

```bash
aws/deploy.sh dev
```

The deploy script will:

1. Build the TypeScript source (`npm ci` + `npm run build` in `src/`)
2. Create a deployment zip with production dependencies
3. Run `terraform init` and `terraform apply` (creates/updates API Gateway, DynamoDB tables, S3 bucket, Lambda functions, CloudWatch alarms)
4. Update all Lambda function code via `aws lambda update-function-code`
5. Flush the API Gateway cache

### What gets deployed

The deploy script creates:

- **API Gateway** — REST API with Lambda authorizer, throttling, and stage deployment
- **22 Lambda functions** — one per API endpoint, plus the authorizer
- **10 DynamoDB tables** — customers, applications, versions, files, downloads, uploads, API keys, share tokens, audit, and customer-applications
- **1 S3 bucket** — versioned binary storage with lifecycle rules
- **CloudWatch** — log groups, metrics, and optional email alerts
- **IAM roles** — Lambda execution role with least-privilege policies

## Verify

Test with the admin API key from the bootstrap script:

```bash
API_ENDPOINT=$(cd aws && terraform output -raw api_endpoint)

# List applications (should return empty array)
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "$API_ENDPOINT/v1/applications"

# Create an application
curl -s -X POST -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"applicationId": "my-app", "name": "My App", "customerIds": ["admin"]}' \
  "$API_ENDPOINT/v1/management/applications"
```

Replace `YOUR_API_KEY` with the raw key (not the hash) from the bootstrap script.

## Security Notes

- **Never commit** `terraform.tfvars` or `backend.tfvars` — they are gitignored
- In CI/CD, use environment variables instead of tfvars files:
  ```bash
  export AWS_ACCESS_KEY_ID="AKIA..."
  export AWS_SECRET_ACCESS_KEY="..."
  export AWS_DEFAULT_REGION="eu-west-1"
  ```
  Terraform variables can also be set via `TF_VAR_` prefix:
  ```bash
  export TF_VAR_environment="prod"
  export TF_VAR_alert_email="ops@example.com"
  ```
- The S3 state bucket is encrypted at rest with AES-256 and has public access blocked
- DynamoDB state locking prevents concurrent modifications
- Lambda execution roles follow least-privilege — each function only accesses the tables and buckets it needs
- API Gateway throttling protects against abuse (configurable rate and burst limits)
- Enable `dynamodb_point_in_time_recovery` in production for backup safety

## Architecture

```
Client
  │
  ▼
API Gateway (REST API)
  ├── Lambda Authorizer (Bearer token validation)
  │
  ▼
22 Lambda Functions (Node.js 20)
  │
  ├──────────────────────┬────────────────────┐
  ▼                      ▼                    ▼
DynamoDB             S3 Bucket            CloudWatch
(10 tables,          (versioned,          (logs, metrics,
 PAY_PER_REQUEST)     Glacier lifecycle)   alerts)
```

## Differences from Scaleway

| Feature | AWS | Scaleway |
|---------|-----|----------|
| Compute | Lambda (22 functions) | Serverless Functions (1 API gateway function) |
| Database | DynamoDB (NoSQL) | Serverless SQL (PostgreSQL) |
| Storage | S3 | S3-compatible Object Storage |
| API routing | API Gateway + Lambda Authorizer | In-process router + auth middleware |
| Monitoring | CloudWatch + X-Ray + SNS | Not available |
| State locking | DynamoDB | Local or S3-compatible backend |
