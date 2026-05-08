#!/bin/bash
set -e

# BinDist - Bootstrap Admin User (Scaleway)
# Creates the initial admin user with an API key in Serverless SQL.
#
# Usage: ./bootstrap-admin.sh [environment]

ENVIRONMENT=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== BinDist - Bootstrap Admin User (Scaleway) ==="
echo "Environment: $ENVIRONMENT"
echo ""

# Check required tools
command -v psql >/dev/null 2>&1 || { echo "Error: psql (PostgreSQL client) is required. Install with: sudo apt install postgresql-client"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "Error: openssl is required"; exit 1; }
command -v terraform >/dev/null 2>&1 || { echo "Error: Terraform is required"; exit 1; }

# Get authenticated database URL from Terraform
cd "$SCRIPT_DIR"
DATABASE_URL=$(terraform output -raw database_url 2>/dev/null || echo "")

if [ -z "$DATABASE_URL" ]; then
    echo "Error: Could not retrieve database URL from Terraform output"
    echo "Make sure you have run ./deploy.sh first"
    exit 1
fi

# Ensure sslmode=require for Scaleway Serverless SQL
if [[ "$DATABASE_URL" != *"sslmode="* ]]; then
    DATABASE_URL="${DATABASE_URL}?sslmode=require"
fi

echo "Database: connected"
echo ""

# Check if admin already exists
ADMIN_COUNT=$(PGCONNECT_TIMEOUT=10 psql "$DATABASE_URL" -t -A -c \
    "SELECT COUNT(*) FROM customers WHERE \"isAdmin\" = true;" 2>/dev/null || echo "0")

if [ "$ADMIN_COUNT" != "0" ] && [ "$ADMIN_COUNT" != " 0" ]; then
    echo "Warning: An admin user already exists!"
    echo ""
    read -p "Do you want to create another admin? (y/N): " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Prompt for admin name
read -p "Enter admin name [Admin]: " ADMIN_NAME
ADMIN_NAME=${ADMIN_NAME:-Admin}

# Generate IDs and API key
CUSTOMER_ID=${ADMIN_CUSTOMER_ID:-admin}
API_KEY=$(openssl rand -hex 32)
API_KEY_HASH=$(echo -n "$API_KEY" | openssl dgst -sha256 | awk '{print $2}')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo ""
echo "Creating admin user..."

# Create customer record and API key record in a single transaction
PGCONNECT_TIMEOUT=10 psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
BEGIN;

INSERT INTO customers ("customerId", "name", "apiKeyHash", "isActive", "isAdmin", "isFinancialAdmin", "createdAt", "updatedAt")
VALUES ('$CUSTOMER_ID', '$ADMIN_NAME', '$API_KEY_HASH', true, true, true, '$TIMESTAMP', '$TIMESTAMP');

INSERT INTO api_keys ("apiKeyHash", "customerId", "createdAt", "name")
VALUES ('$API_KEY_HASH', '$CUSTOMER_ID', '$TIMESTAMP', 'Initial admin key');

COMMIT;
SQL

echo "  Customer record created"
echo "  API key record created"

# Get a function URL for testing
FUNCTION_URL=$(terraform output -json function_urls 2>/dev/null | python3 -c "
import sys, json
urls = json.load(sys.stdin)
url = urls.get('listApplications', '')
print(f'https://{url}' if url else '')
" 2>/dev/null || echo "")

echo ""
echo "=== Admin User Created ==="
echo ""
echo "Customer ID: $CUSTOMER_ID"
echo "Admin Name:  $ADMIN_NAME"
echo ""
echo "============================================================"
echo "IMPORTANT: Save this API key - it cannot be retrieved later!"
echo "============================================================"
echo ""
echo "API Key: $API_KEY"
echo ""
echo "============================================================"
echo ""

if [ -n "$FUNCTION_URL" ]; then
    echo "Test your API key:"
    echo "  curl -H \"Authorization: Bearer $API_KEY\" $FUNCTION_URL"
    echo ""
fi

echo "Use this key in the Authorization header: Authorization: Bearer <api-key>"
