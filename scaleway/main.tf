locals {
  name_prefix = "${var.project_name}-${var.environment}"
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
  # Construct authenticated DATABASE_URL: inject IAM user ID and secret key into the endpoint
  database_url = replace(
    module.database.endpoint,
    "postgres://",
    "postgres://${var.scaleway_iam_user_id}:${urlencode(var.scaleway_secret_key)}@"
  )
}

module "object_storage" {
  source = "./modules/object-storage"

  name_prefix        = local.name_prefix
  region             = var.scaleway_region
  versioning_enabled = var.s3_versioning_enabled
  tags               = local.tags
}

module "database" {
  source = "./modules/database"

  name_prefix = local.name_prefix
  min_cpu     = var.database_min_cpu
  max_cpu     = var.database_max_cpu
}

module "functions" {
  source = "./modules/functions"

  name_prefix         = local.name_prefix
  region              = var.scaleway_region
  applications_bucket = module.object_storage.bucket_name
  s3_endpoint         = module.object_storage.s3_endpoint
  admin_customer_id   = var.admin_customer_id
  scaleway_access_key = var.scaleway_access_key
  scaleway_secret_key = var.scaleway_secret_key
  database_url        = local.database_url
  function_zip_path   = var.function_zip_path
  memory_limit        = var.function_memory_limit
  default_timeout     = var.function_timeout
  min_scale           = var.function_min_scale
  max_scale           = var.function_max_scale
  log_level           = var.log_level
  custom_domain       = var.custom_domain
}
