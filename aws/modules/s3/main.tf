# =============================================================================
# S3 Buckets for Application Distribution
# =============================================================================

# Applications bucket - stores application binaries
resource "aws_s3_bucket" "applications" {
  bucket = "${var.name_prefix}-applications-${var.account_id}"

  lifecycle {
    prevent_destroy = false
  }

  tags = var.tags
}

# Bucket versioning
resource "aws_s3_bucket_versioning" "applications" {
  bucket = aws_s3_bucket.applications.id

  versioning_configuration {
    status = var.versioning_enabled ? "Enabled" : "Suspended"
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "applications" {
  bucket = aws_s3_bucket.applications.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "applications" {
  bucket = aws_s3_bucket.applications.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Lifecycle rules for cost optimization
resource "aws_s3_bucket_lifecycle_configuration" "applications" {
  count  = var.lifecycle_glacier_days > 0 ? 1 : 0
  bucket = aws_s3_bucket.applications.id

  rule {
    id     = "archive-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_transition {
      noncurrent_days = var.lifecycle_glacier_days
      storage_class   = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 365
    }
  }

  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# CORS configuration for browser-based uploads
resource "aws_s3_bucket_cors_configuration" "applications" {
  bucket = aws_s3_bucket.applications.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag", "Content-Length", "Content-Type"]
    max_age_seconds = 3600
  }
}
