output "bucket_name" {
  description = "Name of the applications bucket"
  value       = scaleway_object_bucket.applications.name
}

output "s3_endpoint" {
  description = "S3-compatible endpoint URL"
  value       = "https://s3.${var.region}.scw.cloud"
}
