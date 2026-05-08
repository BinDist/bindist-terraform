# =============================================================================
# S3 Bucket Outputs
# =============================================================================

output "applications_bucket_name" {
  description = "Name of the applications S3 bucket"
  value       = aws_s3_bucket.applications.id
}

output "applications_bucket_arn" {
  description = "ARN of the applications S3 bucket"
  value       = aws_s3_bucket.applications.arn
}

output "applications_bucket_domain" {
  description = "Domain name of the applications S3 bucket"
  value       = aws_s3_bucket.applications.bucket_regional_domain_name
}

output "bucket_arns" {
  description = "List of all bucket ARNs for IAM policies"
  value = [
    aws_s3_bucket.applications.arn,
    "${aws_s3_bucket.applications.arn}/*",
  ]
}
