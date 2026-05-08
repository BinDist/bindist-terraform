output "applications_bucket" {
  description = "Name of the applications S3-compatible bucket"
  value       = module.object_storage.bucket_name
}

output "s3_endpoint" {
  description = "S3-compatible endpoint URL"
  value       = module.object_storage.s3_endpoint
}

output "gateway_url" {
  description = "API gateway endpoint URL (custom domain if configured, otherwise default)"
  value       = module.functions.gateway_url
}

output "gateway_domain_name" {
  description = "Default Scaleway domain name for the API gateway (use as CNAME target for custom domains)"
  value       = module.functions.gateway_domain_name
}

output "function_namespace_id" {
  description = "Scaleway function namespace ID"
  value       = module.functions.namespace_id
}

output "database_endpoint" {
  description = "Serverless SQL database endpoint (without credentials)"
  value       = module.database.endpoint
  sensitive   = true
}

output "database_url" {
  description = "Authenticated database connection URL (with IAM credentials)"
  value       = local.database_url
  sensitive   = true
}

output "database_name" {
  description = "Serverless SQL database name"
  value       = module.database.database_name
}
