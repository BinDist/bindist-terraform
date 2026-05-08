#!/bin/bash
set -e

# BinDist - Terraform Backend Setup
# Run this once before first deployment to create the S3 bucket and DynamoDB table for state
#
# Usage: ./setup-backend.sh [project-name] [region]

PROJECT_NAME=${1:-bindist}
AWS_REGION=${2:-eu-west-1}
BUCKET_NAME="${PROJECT_NAME}-terraform-state"
TABLE_NAME="${PROJECT_NAME}-terraform-locks"

echo "=== BinDist - Terraform Backend Setup ==="
echo "Project:    $PROJECT_NAME"
echo "Region:     $AWS_REGION"
echo "S3 Bucket:  $BUCKET_NAME"
echo "Lock Table: $TABLE_NAME"
echo ""

# Check required tools
command -v aws >/dev/null 2>&1 || { echo "Error: AWS CLI is required"; exit 1; }

# Check AWS credentials
echo "Checking AWS credentials..."
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || { echo "Error: AWS credentials not configured"; exit 1; }
echo "AWS Account: $AWS_ACCOUNT"
echo ""

# Create S3 bucket for state
echo "Creating S3 bucket for Terraform state..."
if aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
    echo "  Bucket already exists"
else
    # Create bucket (LocationConstraint required for non-us-east-1 regions)
    if [ "$AWS_REGION" = "us-east-1" ]; then
        aws s3api create-bucket \
            --bucket "$BUCKET_NAME" \
            --region "$AWS_REGION"
    else
        aws s3api create-bucket \
            --bucket "$BUCKET_NAME" \
            --region "$AWS_REGION" \
            --create-bucket-configuration LocationConstraint="$AWS_REGION"
    fi

    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket "$BUCKET_NAME" \
        --versioning-configuration Status=Enabled

    # Enable encryption
    aws s3api put-bucket-encryption \
        --bucket "$BUCKET_NAME" \
        --server-side-encryption-configuration '{
            "Rules": [{
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }]
        }'

    # Block public access
    aws s3api put-public-access-block \
        --bucket "$BUCKET_NAME" \
        --public-access-block-configuration '{
            "BlockPublicAcls": true,
            "IgnorePublicAcls": true,
            "BlockPublicPolicy": true,
            "RestrictPublicBuckets": true
        }'

    echo "  Bucket created successfully"
fi

# Create DynamoDB table for state locking
echo ""
echo "Creating DynamoDB table for state locking..."
if aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
    echo "  Table already exists"
else
    aws dynamodb create-table \
        --table-name "$TABLE_NAME" \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --region "$AWS_REGION" \
        --no-cli-pager

    echo "  Waiting for table to be active..."
    aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$AWS_REGION"
    echo "  Table created successfully"
fi

echo ""
echo "=== Backend Setup Complete ==="
echo ""
echo "Create your backend configuration file:"
echo ""
echo "  cat > environments/aws/dev/backend.tfvars << EOF"
echo "  bucket         = \"$BUCKET_NAME\""
echo "  key            = \"dev/terraform.tfstate\""
echo "  region         = \"$AWS_REGION\""
echo "  dynamodb_table = \"$TABLE_NAME\""
echo "  encrypt        = true"
echo "  EOF"
echo ""
echo "Then run: ./deploy.sh dev"
