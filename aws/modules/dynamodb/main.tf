# =============================================================================
# DynamoDB Tables for Application Distribution
# Creates all tables needed for the data plane
# =============================================================================

# Customers table
# Stores customer accounts with API key authentication
resource "aws_dynamodb_table" "customers" {
  name         = "${var.name_prefix}-customers"
  billing_mode = var.billing_mode
  hash_key     = "customerId"

  attribute {
    name = "customerId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = var.tags
}

# Applications table
# Stores application metadata
resource "aws_dynamodb_table" "applications" {
  name         = "${var.name_prefix}-applications"
  billing_mode = var.billing_mode
  hash_key     = "applicationId"

  attribute {
    name = "applicationId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = var.tags
}

# Customer-Applications table
# Access control - which customers can access which applications
resource "aws_dynamodb_table" "customer_applications" {
  name         = "${var.name_prefix}-customer-applications"
  billing_mode = var.billing_mode
  hash_key     = "customerId"
  range_key    = "applicationId"

  attribute {
    name = "customerId"
    type = "S"
  }

  attribute {
    name = "applicationId"
    type = "S"
  }

  # GSI to query all customers for a given application
  global_secondary_index {
    name            = "applicationId-index"
    hash_key        = "applicationId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = var.tags
}

# Versions table
# Stores version information for each application
resource "aws_dynamodb_table" "versions" {
  name         = "${var.name_prefix}-versions"
  billing_mode = var.billing_mode
  hash_key     = "applicationId"
  range_key    = "version"

  attribute {
    name = "applicationId"
    type = "S"
  }

  attribute {
    name = "version"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = var.tags
}

# Application files table
# Stores file metadata for multi-file versions
resource "aws_dynamodb_table" "application_files" {
  name         = "${var.name_prefix}-application-files"
  billing_mode = var.billing_mode
  hash_key     = "versionId"
  range_key    = "fileId"

  attribute {
    name = "versionId"
    type = "S"
  }

  attribute {
    name = "fileId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = var.tags
}

# Downloads table
# Tracks download history for analytics
resource "aws_dynamodb_table" "downloads" {
  name         = "${var.name_prefix}-downloads"
  billing_mode = var.billing_mode
  hash_key     = "applicationId"
  range_key    = "downloadId"

  attribute {
    name = "applicationId"
    type = "S"
  }

  attribute {
    name = "downloadId"
    type = "S"
  }

  attribute {
    name = "customerId"
    type = "S"
  }

  attribute {
    name = "downloadedAt"
    type = "S"
  }

  global_secondary_index {
    name            = "customerId-downloadedAt-index"
    hash_key        = "customerId"
    range_key       = "downloadedAt"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = var.tags
}

# Uploads table
# Tracks upload history with IP detection
resource "aws_dynamodb_table" "uploads" {
  name         = "${var.name_prefix}-uploads"
  billing_mode = var.billing_mode
  hash_key     = "applicationId"
  range_key    = "uploadId"

  attribute {
    name = "applicationId"
    type = "S"
  }

  attribute {
    name = "uploadId"
    type = "S"
  }

  attribute {
    name = "customerId"
    type = "S"
  }

  attribute {
    name = "uploadedAt"
    type = "S"
  }

  global_secondary_index {
    name            = "customerId-uploadedAt-index"
    hash_key        = "customerId"
    range_key       = "uploadedAt"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = var.tags
}

# API Keys table
# Provides O(1) lookup for API key validation
resource "aws_dynamodb_table" "api_keys" {
  name         = "${var.name_prefix}-api-keys"
  billing_mode = var.billing_mode
  hash_key     = "apiKeyHash"

  attribute {
    name = "apiKeyHash"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = var.tags
}

# Share tokens table
# Stores temporary tokens for public download links
resource "aws_dynamodb_table" "share_tokens" {
  name         = "${var.name_prefix}-share-tokens"
  billing_mode = var.billing_mode
  hash_key     = "token"

  attribute {
    name = "token"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = var.tags
}

# Audit table
# Tracks account events for compliance and debugging
resource "aws_dynamodb_table" "audit" {
  name         = "${var.name_prefix}-audit"
  billing_mode = var.billing_mode
  hash_key     = "eventType"
  range_key    = "eventId"

  attribute {
    name = "eventType"
    type = "S"
  }

  attribute {
    name = "eventId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  global_secondary_index {
    name            = "timestamp-index"
    hash_key        = "timestamp"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = var.tags
}
