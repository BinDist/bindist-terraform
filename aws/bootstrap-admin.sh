#!/bin/bash
set -e

# BinDist - Bootstrap Admin User
# Creates the initial admin user with an API key
#
# Usage: ./bootstrap-admin.sh [environment]

ENVIRONMENT=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== BinDist - Bootstrap Admin User ==="
echo "Environment: $ENVIRONMENT"
echo ""

# Check required tools
command -v aws >/dev/null 2>&1 || { echo "Error: AWS CLI is required"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "Error: openssl is required"; exit 1; }
command -v terraform >/dev/null 2>&1 || { echo "Error: Terraform is required"; exit 1; }

# Check AWS credentials
aws sts get-caller-identity >/dev/null 2>&1 || { echo "Error: AWS credentials not configured"; exit 1; }

# Get table prefix from Terraform
cd "$SCRIPT_DIR"
TABLE_PREFIX=$(terraform output -json dynamodb_tables 2>/dev/null | grep -o '"[^"]*-customers"' | head -1 | sed 's/-customers"$//' | sed 's/^"//')

if [ -z "$TABLE_PREFIX" ]; then
    echo "Error: Could not determine table prefix from Terraform output"
    echo "Make sure you have run ./deploy.sh first"
    exit 1
fi

CUSTOMERS_TABLE="${TABLE_PREFIX}-customers"
API_KEYS_TABLE="${TABLE_PREFIX}-api-keys"

echo "Tables:"
echo "  Customers: $CUSTOMERS_TABLE"
echo "  API Keys:  $API_KEYS_TABLE"
echo ""

# Check if admin already exists
ADMIN_EXISTS=$(aws dynamodb scan \
    --table-name "$CUSTOMERS_TABLE" \
    --filter-expression "isAdmin = :admin" \
    --expression-attribute-values '{":admin": {"BOOL": true}}' \
    --select COUNT \
    --query "Count" \
    --output text 2>/dev/null || echo "0")

if [ "$ADMIN_EXISTS" != "0" ]; then
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
CUSTOMER_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
API_KEY=$(openssl rand -hex 32)
API_KEY_HASH=$(echo -n "$API_KEY" | openssl dgst -sha256 | awk '{print $2}')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo ""
echo "Creating admin user..."

# Create customer record (full access: isAdmin + isFinancialAdmin)
aws dynamodb put-item \
    --table-name "$CUSTOMERS_TABLE" \
    --item "{
        \"customerId\": {\"S\": \"$CUSTOMER_ID\"},
        \"name\": {\"S\": \"$ADMIN_NAME\"},
        \"apiKeyHash\": {\"S\": \"$API_KEY_HASH\"},
        \"isActive\": {\"BOOL\": true},
        \"isAdmin\": {\"BOOL\": true},
        \"isFinancialAdmin\": {\"BOOL\": true},
        \"createdAt\": {\"S\": \"$TIMESTAMP\"},
        \"updatedAt\": {\"S\": \"$TIMESTAMP\"}
    }" \
    --condition-expression "attribute_not_exists(customerId)"

echo "  Customer record created"

# Create API key record
aws dynamodb put-item \
    --table-name "$API_KEYS_TABLE" \
    --item "{
        \"apiKeyHash\": {\"S\": \"$API_KEY_HASH\"},
        \"customerId\": {\"S\": \"$CUSTOMER_ID\"},
        \"createdAt\": {\"S\": \"$TIMESTAMP\"},
        \"name\": {\"S\": \"Initial admin key\"}
    }"

echo "  API key record created"

# Get API endpoint
API_ENDPOINT=$(terraform output -raw api_endpoint 2>/dev/null || echo "")

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

if [ -n "$API_ENDPOINT" ]; then
    echo "Test your API key:"
    echo "  curl -H \"Authorization: Bearer $API_KEY\" $API_ENDPOINT/v1/applications"
    echo ""
fi

echo "Use this key in the Authorization header: Authorization: Bearer <api-key>"
