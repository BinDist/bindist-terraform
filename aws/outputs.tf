# =============================================================================
# Outputs
# =============================================================================

output "api_endpoint" {
  description = "API Gateway endpoint URL"
  value       = module.api_gateway.api_url
}

output "api_id" {
  description = "API Gateway REST API ID"
  value       = module.api_gateway.api_id
}

output "applications_bucket" {
  description = "S3 bucket name for application binaries"
  value       = module.s3.applications_bucket_name
}

output "dynamodb_tables" {
  description = "Map of DynamoDB table names"
  value       = module.dynamodb.table_names
}

output "lambda_function_names" {
  description = "Map of Lambda function names"
  value       = module.lambda.function_names
}

output "lambda_execution_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = module.lambda.execution_role_arn
}
