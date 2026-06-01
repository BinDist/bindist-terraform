variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "region" {
  description = "Scaleway region"
  type        = string
}

variable "applications_bucket" {
  description = "Name of the applications S3 bucket"
  type        = string
}

variable "s3_endpoint" {
  description = "S3-compatible endpoint URL"
  type        = string
}

variable "admin_customer_id" {
  description = "Customer ID for the admin user"
  type        = string
  default     = "admin"
}

variable "scaleway_access_key" {
  description = "Scaleway access key for S3 compatibility"
  type        = string
  sensitive   = true
}

variable "scaleway_secret_key" {
  description = "Scaleway secret key for S3 compatibility"
  type        = string
  sensitive   = true
}

variable "database_url" {
  description = "PostgreSQL connection string for Serverless SQL"
  type        = string
  sensitive   = true
}

variable "function_zip_path" {
  description = "Path to the function deployment zip"
  type        = string
}

variable "memory_limit" {
  description = "Memory limit for functions in MB"
  type        = number
  default     = 256
}

variable "default_timeout" {
  description = "Default timeout for functions in seconds"
  type        = number
  default     = 30
}

variable "min_scale" {
  description = "Minimum number of function instances"
  type        = number
  default     = 0
}

variable "max_scale" {
  description = "Maximum number of function instances"
  type        = number
  default     = 5
}

variable "log_level" {
  description = "Log level for functions"
  type        = string
  default     = "info"
}

variable "custom_domain" {
  description = "Custom domain hostname for the API gateway (requires a CNAME record pointing to the gateway domain). Leave empty to skip."
  type        = string
  default     = ""
}

variable "enable_ttl_cleanup_cron" {
  description = "Create the single-tenant TTL cleanup worker + daily cron. Defaults true for standalone single-tenant deploys; the multi-tenant control plane disables it and runs its own per-tenant sweep instead."
  type        = bool
  default     = true
}

variable "ttl_cleanup_schedule" {
  description = "Cron schedule for the single-tenant TTL cleanup worker (UTC)."
  type        = string
  default     = "30 3 * * *"
}

variable "extra_environment_variables" {
  description = "Additional environment variables to set on the function namespace"
  type        = map(string)
  default     = {}
}

variable "extra_secret_environment_variables" {
  description = "Additional secret environment variables to set on the function namespace"
  type        = map(string)
  default     = {}
  sensitive   = true
}
