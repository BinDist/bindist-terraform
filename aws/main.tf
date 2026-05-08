# =============================================================================
# BinDist - Application Distribution Infrastructure
# =============================================================================
#
# This Terraform configuration deploys a complete application distribution
# system on AWS, including:
#
# - DynamoDB tables for metadata (applications, versions, customers, etc.)
# - S3 bucket for binary storage with pre-signed URL access
# - Lambda functions for the REST API
# - API Gateway with custom authorizer
# - CloudWatch for monitoring and alerts
#
# Usage:
#   1. Configure your AWS credentials
#   2. Copy environments/dev/terraform.tfvars.example to terraform.tfvars
#   3. Run: terraform init
#   4. Run: terraform plan
#   5. Run: terraform apply
#
# =============================================================================

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# =============================================================================
# DynamoDB Tables
# =============================================================================

module "dynamodb" {
  source = "./modules/dynamodb"

  name_prefix            = local.name_prefix
  billing_mode           = var.dynamodb_billing_mode
  point_in_time_recovery = var.dynamodb_point_in_time_recovery
  tags                   = local.common_tags
}

# =============================================================================
# S3 Buckets
# =============================================================================

module "s3" {
  source = "./modules/s3"

  name_prefix            = local.name_prefix
  account_id             = data.aws_caller_identity.current.account_id
  versioning_enabled     = var.s3_versioning_enabled
  lifecycle_glacier_days = var.s3_lifecycle_glacier_days
  tags                   = local.common_tags
}

# =============================================================================
# Monitoring (CloudWatch, SNS)
# =============================================================================

module "monitoring" {
  source = "./modules/monitoring"

  name_prefix        = local.name_prefix
  environment        = var.environment
  alert_email        = var.alert_email
  log_retention_days = var.log_retention_days
}

# =============================================================================
# Lambda Functions
# =============================================================================

module "lambda" {
  source = "./modules/lambda"

  name_prefix         = local.name_prefix
  runtime             = var.lambda_runtime
  memory_size         = var.lambda_memory_size
  timeout             = var.lambda_timeout
  enable_xray         = var.enable_xray
  log_retention_days  = var.log_retention_days
  dynamodb_table_arns = module.dynamodb.table_arns
  s3_bucket_arns      = module.s3.bucket_arns
  tags                = local.common_tags

  environment_variables = {
    ENVIRONMENT                    = var.environment
    PROJECT_NAME                   = var.project_name
    TABLE_PREFIX                   = local.name_prefix
    APPLICATIONS_BUCKET            = module.s3.applications_bucket_name
    MAX_BUCKET_SIZE_GB             = tostring(var.max_bucket_size_gb)
    LOG_LEVEL                      = var.environment == "prod" ? "info" : "debug"
    SHARE_LINK_DEFAULT_TTL_MINUTES = tostring(var.share_link_default_ttl_minutes)
    SHARE_LINK_MAX_TTL_MINUTES     = tostring(var.share_link_max_ttl_minutes)
  }
}

# =============================================================================
# API Gateway
# =============================================================================

module "api_gateway" {
  source = "./modules/api-gateway"

  name_prefix            = local.name_prefix
  environment            = var.environment
  throttling_rate_limit  = var.api_throttling_rate_limit
  throttling_burst_limit = var.api_throttling_burst_limit
  lambda_functions       = module.lambda.function_arns
  lambda_invoke_arns     = module.lambda.invoke_arns
  authorizer_invoke_arn  = module.lambda.authorizer_invoke_arn

  depends_on = [module.lambda]
}
