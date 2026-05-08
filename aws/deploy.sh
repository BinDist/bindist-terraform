#!/bin/bash
set -e

# BinDist - Lambda Deployment Script
# Usage: ./deploy.sh [dev|prod]
#
# This script:
# 1. Builds the Lambda TypeScript code
# 2. Applies Terraform infrastructure changes
# 3. Updates Lambda function code

ENVIRONMENT=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== BinDist - Lambda Deployment ==="
echo "Environment: $ENVIRONMENT"
echo ""

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    echo "Error: Invalid environment. Use 'dev' or 'prod'"
    exit 1
fi

# Check for backend config
ENV_DIR="$SCRIPT_DIR/../environments/aws/$ENVIRONMENT"
if [ -f "$ENV_DIR/backend.tfvars" ]; then
    BACKEND_CONFIG="-backend-config=$ENV_DIR/backend.tfvars"
else
    echo "Copy terraform.tfvars.example and customize it:"
    echo "  cp environments/aws/$ENVIRONMENT/backend.tfvars.example environments/aws/$ENVIRONMENT/backend.tfvars"
    exit 1
fi

# Check for environment-specific tfvars
if [ ! -f "$ENV_DIR/terraform.tfvars" ]; then
    echo "Error: environments/aws/$ENVIRONMENT/terraform.tfvars not found"
    echo "Copy terraform.tfvars.example and customize it:"
    echo "  cp environments/aws/$ENVIRONMENT/terraform.tfvars.example environments/aws/$ENVIRONMENT/terraform.tfvars"
    exit 1
fi

# Check required tools (build.sh checks node/npm/zip; deploy needs the rest)
command -v terraform >/dev/null 2>&1 || { echo "Error: Terraform is required"; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "Error: AWS CLI is required"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq is required"; exit 1; }

# Check AWS credentials
echo "Checking AWS credentials..."
aws sts get-caller-identity >/dev/null 2>&1 || { echo "Error: AWS credentials not configured"; exit 1; }
echo "AWS credentials OK"
echo ""

echo "=== Step 1: Building Lambda Functions ==="
"$SCRIPT_DIR/build.sh"
echo ""

echo "=== Step 2: Applying Terraform Infrastructure ==="
cd "$SCRIPT_DIR"

# Initialize Terraform
echo "Initializing Terraform..."
terraform init $BACKEND_CONFIG -reconfigure

# Plan deployment
echo "Planning deployment..."
terraform plan -var-file="$ENV_DIR/terraform.tfvars" -out=tfplan -no-color

# Apply deployment
# echo "Applying deployment..."
terraform apply tfplan

# Clean up plan file
rm -f tfplan

echo ""
echo "=== Step 3: Deploying Lambda Code ==="

# Get function names from Terraform output
FUNCTION_NAMES=$(terraform output -json lambda_function_names | jq -r 'to_entries[] | .value')
FUNCTION_COUNT=$(echo "$FUNCTION_NAMES" | wc -l)
UPDATED_COUNT=0
FAILED_FUNCTIONS=""

echo "Found $FUNCTION_COUNT functions to update"
echo ""

for FUNCTION_NAME in $FUNCTION_NAMES; do
    echo "Updating: $FUNCTION_NAME"

    # Wait for function to be ready
    if ! aws lambda wait function-active-v2 --function-name "$FUNCTION_NAME" 2>/dev/null; then
        echo "  Warning: Could not confirm function is active, attempting update anyway..."
    fi

    # Update the function code
    if aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --zip-file "fileb://$SCRIPT_DIR/function.zip" \
        --no-cli-pager > /dev/null 2>&1; then
        UPDATED_COUNT=$((UPDATED_COUNT + 1))
        echo "  OK"
    else
        echo "  FAILED"
        FAILED_FUNCTIONS="$FAILED_FUNCTIONS $FUNCTION_NAME"
    fi
done

echo ""
echo "Updated $UPDATED_COUNT of $FUNCTION_COUNT functions"

if [ -n "$FAILED_FUNCTIONS" ]; then
    echo "ERROR: Failed to update:$FAILED_FUNCTIONS"
    exit 1
fi

echo ""
echo "=== Step 4: Flushing API Gateway Cache ==="

# Get the API Gateway ID and flush cache
API_ID=$(terraform output -raw api_id 2>/dev/null || echo "")
if [ -n "$API_ID" ]; then
    echo "Flushing cache for API Gateway: $API_ID (stage: $ENVIRONMENT)"
    aws apigateway flush-stage-cache --rest-api-id "$API_ID" --stage-name "$ENVIRONMENT" 2>/dev/null || echo "Cache flush skipped (caching may not be enabled)"
else
    echo "Skipping cache flush (API Gateway ID not found)"
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "API Endpoint: $(terraform output -raw api_endpoint)"
echo ""
echo "Next steps:"
echo "  1. Run ./bootstrap-admin.sh to create the initial admin user (first time only)"
echo "  2. Use the API key to authenticate requests"
