# =============================================================================
# DynamoDB Table Outputs
# =============================================================================

output "table_names" {
  description = "Map of all table names"
  value = {
    customers             = aws_dynamodb_table.customers.name
    applications          = aws_dynamodb_table.applications.name
    customer_applications = aws_dynamodb_table.customer_applications.name
    versions              = aws_dynamodb_table.versions.name
    application_files     = aws_dynamodb_table.application_files.name
    downloads             = aws_dynamodb_table.downloads.name
    uploads               = aws_dynamodb_table.uploads.name
    api_keys              = aws_dynamodb_table.api_keys.name
    share_tokens          = aws_dynamodb_table.share_tokens.name
    audit                 = aws_dynamodb_table.audit.name
  }
}

output "table_arns" {
  description = "List of all table ARNs for IAM policies"
  value = [
    aws_dynamodb_table.customers.arn,
    aws_dynamodb_table.applications.arn,
    aws_dynamodb_table.customer_applications.arn,
    aws_dynamodb_table.versions.arn,
    aws_dynamodb_table.application_files.arn,
    aws_dynamodb_table.downloads.arn,
    aws_dynamodb_table.uploads.arn,
    aws_dynamodb_table.api_keys.arn,
    aws_dynamodb_table.share_tokens.arn,
    aws_dynamodb_table.audit.arn,
    # Include index ARNs for GSI access
    "${aws_dynamodb_table.customer_applications.arn}/index/*",
    "${aws_dynamodb_table.downloads.arn}/index/*",
    "${aws_dynamodb_table.uploads.arn}/index/*",
    "${aws_dynamodb_table.audit.arn}/index/*",
  ]
}

# Individual table outputs for convenience
output "customers_table_name" {
  description = "Customers table name"
  value       = aws_dynamodb_table.customers.name
}

output "applications_table_name" {
  description = "Applications table name"
  value       = aws_dynamodb_table.applications.name
}

output "customer_applications_table_name" {
  description = "Customer-Applications table name"
  value       = aws_dynamodb_table.customer_applications.name
}

output "versions_table_name" {
  description = "Versions table name"
  value       = aws_dynamodb_table.versions.name
}

output "application_files_table_name" {
  description = "Application files table name"
  value       = aws_dynamodb_table.application_files.name
}

output "downloads_table_name" {
  description = "Downloads table name"
  value       = aws_dynamodb_table.downloads.name
}

output "uploads_table_name" {
  description = "Uploads table name"
  value       = aws_dynamodb_table.uploads.name
}

output "api_keys_table_name" {
  description = "API keys table name"
  value       = aws_dynamodb_table.api_keys.name
}

output "share_tokens_table_name" {
  description = "Share tokens table name"
  value       = aws_dynamodb_table.share_tokens.name
}

output "audit_table_name" {
  description = "Audit table name"
  value       = aws_dynamodb_table.audit.name
}
