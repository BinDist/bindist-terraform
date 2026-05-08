#!/bin/bash
set -e

# BinDist - Scaleway Deployment Script
# Usage: ./deploy.sh [dev|prod]
#
# This script:
# 1. Builds the function code with the Scaleway adapter
# 2. Applies Terraform infrastructure changes
# 3. Prints function URLs

ENVIRONMENT=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== BinDist - Scaleway Deployment ==="
echo "Environment: $ENVIRONMENT"
echo ""

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    echo "Error: Invalid environment. Use 'dev' or 'prod'"
    exit 1
fi

# Check for backend config
ENV_DIR="$SCRIPT_DIR/../environments/scaleway/$ENVIRONMENT"
BACKEND_CONFIG=""
if [ -f "$ENV_DIR/backend.tfvars" ]; then
    BACKEND_CONFIG="-backend-config=$ENV_DIR/backend.tfvars"
fi

# Check for environment-specific tfvars
if [ ! -f "$ENV_DIR/terraform.tfvars" ]; then
    echo "Error: $ENV_DIR/terraform.tfvars not found"
    echo "Copy terraform.tfvars.example and customize it:"
    echo "  cp $ENV_DIR/terraform.tfvars.example $ENV_DIR/terraform.tfvars"
    exit 1
fi

# Check required tools (build.sh checks node/npm/npx/zip; deploy needs terraform)
command -v terraform >/dev/null 2>&1 || { echo "Error: Terraform is required"; exit 1; }

echo "=== Step 1: Building Functions ==="
"$SCRIPT_DIR/build.sh"
echo ""

echo "=== Step 2: Applying Terraform Infrastructure ==="
cd "$SCRIPT_DIR"
echo "Initializing Terraform..."
terraform init $BACKEND_CONFIG -reconfigure
echo "Planning deployment..."
terraform plan \
    -var-file="$ENV_DIR/terraform.tfvars" \
    -var="function_zip_path=$SCRIPT_DIR/function.zip" \
    -out=tfplan \
    -no-color
terraform apply tfplan
rm -f tfplan
echo ""

echo "=== Step 3: Initialize Database Schema ==="
DATABASE_URL=$(terraform output -raw database_url 2>/dev/null || echo "")
# Ensure sslmode=require for Scaleway Serverless SQL
if [[ -n "$DATABASE_URL" && "$DATABASE_URL" != *"sslmode="* ]]; then
    DATABASE_URL="${DATABASE_URL}?sslmode=require"
fi
if [ -n "$DATABASE_URL" ]; then
    echo "Applying database schema..."
    if command -v psql >/dev/null 2>&1; then
        PGCONNECT_TIMEOUT=10 psql "$DATABASE_URL" -f "$SCRIPT_DIR/modules/database/schema.sql" 2>&1 || {
            echo "Warning: Schema initialization via psql failed."
        }
    else
        # Fall back to Node.js pg client (already available from adapter build)
        SCHEMA_FILE="$SCRIPT_DIR/modules/database/schema.sql" DATABASE_URL="$DATABASE_URL" node -e "
            const { Pool } = require('pg');
            const fs = require('fs');
            const schema = fs.readFileSync(process.env.SCHEMA_FILE, 'utf-8');
            const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
            pool.query(schema)
                .then(() => { console.log('Schema applied via Node.js pg client'); return pool.end(); })
                .catch(e => { console.error('Schema error:', e.message); process.exit(1); });
        " 2>&1 || echo "Warning: Schema initialization failed."
    fi
    echo "Schema applied."
else
    echo "Warning: Could not retrieve database endpoint. Apply schema manually after deploy."
fi
echo ""

echo "=== Step 4: Gateway URL ==="
GATEWAY_URL=$(terraform output -raw gateway_url 2>/dev/null || echo "")
GATEWAY_DOMAIN=$(terraform output -raw gateway_domain_name 2>/dev/null || echo "")
if [ -n "$GATEWAY_URL" ]; then
    echo "  API Gateway: https://$GATEWAY_URL"
    if [ "$GATEWAY_URL" != "$GATEWAY_DOMAIN" ]; then
        echo "  Custom domain active: $GATEWAY_URL -> $GATEWAY_DOMAIN"
    fi
    echo ""
    echo "  To use a custom domain:"
    echo "    1. Create a CNAME record in your DNS provider:"
    echo "       api.yourdomain.com  CNAME  $GATEWAY_DOMAIN"
    echo "    2. Set custom_domain = \"api.yourdomain.com\" in your terraform.tfvars"
    echo "    3. Re-run this deploy script"
else
    terraform output gateway_url
fi
echo ""

echo "=== Deployment Complete ==="
echo ""
echo "All functions are backed by Scaleway Serverless SQL (PostgreSQL) and S3-compatible Object Storage."
