# =============================================================================
# Core Configuration
# =============================================================================

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "bindist"
}

variable "environment" {
  description = "Environment name (e.g., 'dev', 'staging', 'prod')"
  type        = string
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "eu-west-1"
}

# =============================================================================
# DynamoDB Configuration
# =============================================================================

variable "dynamodb_billing_mode" {
  description = "DynamoDB billing mode (PAY_PER_REQUEST or PROVISIONED)"
  type        = string
  default     = "PAY_PER_REQUEST"
}

variable "dynamodb_point_in_time_recovery" {
  description = "Enable point-in-time recovery for DynamoDB tables"
  type        = bool
  default     = false
}

# =============================================================================
# S3 Configuration
# =============================================================================

variable "s3_versioning_enabled" {
  description = "Enable S3 versioning for the applications bucket"
  type        = bool
  default     = true
}

variable "s3_lifecycle_glacier_days" {
  description = "Days before moving old versions to Glacier (0 to disable)"
  type        = number
  default     = 90
}

# =============================================================================
# Lambda Configuration
# =============================================================================

variable "lambda_runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs22.x"
}

variable "lambda_memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 256
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "enable_xray" {
  description = "Enable X-Ray tracing for Lambda functions"
  type        = bool
  default     = true
}

# =============================================================================
# API Gateway Configuration
# =============================================================================

variable "api_throttling_rate_limit" {
  description = "API throttling rate limit (requests per second)"
  type        = number
  default     = 100
}

variable "api_throttling_burst_limit" {
  description = "API throttling burst limit"
  type        = number
  default     = 200
}

# =============================================================================
# Monitoring Configuration
# =============================================================================

variable "alert_email" {
  description = "Email address for CloudWatch alerts (optional)"
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

# =============================================================================
# Storage Quota
# =============================================================================

variable "max_bucket_size_gb" {
  description = "Maximum storage quota in GB for the applications bucket"
  type        = number
  default     = 100
}

# =============================================================================
# Share Link Configuration
# =============================================================================

variable "share_link_default_ttl_minutes" {
  description = "Default TTL for share links in minutes"
  type        = number
  default     = 10080 # 7 days
}

variable "share_link_max_ttl_minutes" {
  description = "Maximum TTL for share links in minutes"
  type        = number
  default     = 86400 # 60 days
}
