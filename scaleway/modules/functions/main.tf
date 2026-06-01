resource "scaleway_function_namespace" "main" {
  name        = var.name_prefix
  description = "BinDist serverless functions"

  environment_variables = merge(
    {
      APPLICATIONS_BUCKET = var.applications_bucket
      AWS_ENDPOINT_URL_S3 = var.s3_endpoint
      AWS_REGION          = var.region
      BACKEND             = "pg"
      TABLE_PREFIX        = "${var.name_prefix}-"
      ADMIN_CUSTOMER_ID   = var.admin_customer_id
      LOG_LEVEL           = var.log_level
    },
    var.extra_environment_variables
  )

  secret_environment_variables = merge(
    {
      AWS_ACCESS_KEY_ID     = var.scaleway_access_key
      AWS_SECRET_ACCESS_KEY = var.scaleway_secret_key
      DATABASE_URL          = var.database_url
    },
    var.extra_secret_environment_variables
  )
}

resource "scaleway_function" "api_gateway" {
  namespace_id = scaleway_function_namespace.main.id
  name         = "api-gateway"
  runtime      = "node22"
  privacy      = "public"
  handler      = "functions/api-gateway/handler.handle"
  zip_file     = var.function_zip_path
  zip_hash     = filesha256(var.function_zip_path)
  memory_limit = 512
  timeout      = 300
  min_scale    = var.min_scale
  max_scale    = var.max_scale
  deploy       = true

  environment_variables = {
    GATEWAY_DOMAIN = var.custom_domain
  }
}

resource "scaleway_function_domain" "custom" {
  count       = var.custom_domain != "" ? 1 : 0
  function_id = scaleway_function.api_gateway.id
  hostname    = var.custom_domain
}

# TTL cleanup worker: a private, cron-invoked function that deletes expired rows
# (ttl < now) from the single-tenant schema's downloads/uploads/share_tokens/
# audit tables. On AWS this is handled natively by DynamoDB TTL; Scaleway
# Postgres has no native TTL, so this enforces retention out of the box. Reuses
# the same zip as the api gateway (the build emits both entrypoints) and
# inherits TABLE_PREFIX / DATABASE_URL / BACKEND from the shared namespace env.
resource "scaleway_function" "cleanup_worker" {
  count        = var.enable_ttl_cleanup_cron ? 1 : 0
  namespace_id = scaleway_function_namespace.main.id
  name         = "ttl-cleanup"
  runtime      = "node22"
  privacy      = "private"
  handler      = "scaleway/src/cleanup-handler.handle"
  zip_file     = var.function_zip_path
  zip_hash     = filesha256(var.function_zip_path)
  memory_limit = 256
  timeout      = 300
  min_scale    = 0
  max_scale    = 1
  deploy       = true
}

resource "scaleway_function_cron" "ttl_cleanup" {
  count       = var.enable_ttl_cleanup_cron ? 1 : 0
  function_id = scaleway_function.cleanup_worker[0].id
  schedule    = var.ttl_cleanup_schedule
  args        = jsonencode({})
}
