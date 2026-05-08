# Core
variable "project_name" {
  description = "Project name used as prefix for resources"
  type        = string
  default     = "bindist"
}

variable "environment" {
  description = "Deployment environment (dev, prod)"
  type        = string
}

# Scaleway
variable "scaleway_project_id" {
  description = "Scaleway project ID"
  type        = string
}

variable "scaleway_region" {
  description = "Scaleway region"
  type        = string
  default     = "fr-par"
}

variable "scaleway_zone" {
  description = "Scaleway zone"
  type        = string
  default     = "fr-par-1"
}

variable "scaleway_access_key" {
  description = "Scaleway access key (used for S3 compatibility)"
  type        = string
  sensitive   = true
}

variable "scaleway_secret_key" {
  description = "Scaleway secret key (used for S3 compatibility)"
  type        = string
  sensitive   = true
}

variable "scaleway_iam_user_id" {
  description = "IAM user ID for database authentication (get via: scw iam api-key get <ACCESS_KEY> -o json | jq -r .user_id)"
  type        = string
}

# Auth
variable "admin_customer_id" {
  description = "Customer ID for the admin user"
  type        = string
  default     = "admin"
}

# Database (Serverless SQL)
variable "database_min_cpu" {
  description = "Minimum vCPU for Serverless SQL (0 for scale-to-zero)"
  type        = number
  default     = 0
}

variable "database_max_cpu" {
  description = "Maximum vCPU for Serverless SQL"
  type        = number
  default     = 4
}

# Object Storage
variable "s3_versioning_enabled" {
  description = "Enable versioning on the applications bucket"
  type        = bool
  default     = true
}

# Functions
variable "function_memory_limit" {
  description = "Memory limit for functions in MB"
  type        = number
  default     = 256
}

variable "function_timeout" {
  description = "Default timeout for functions in seconds"
  type        = number
  default     = 30
}

variable "function_min_scale" {
  description = "Minimum number of function instances"
  type        = number
  default     = 0
}

variable "function_max_scale" {
  description = "Maximum number of function instances"
  type        = number
  default     = 5
}

# Deployment
variable "function_zip_path" {
  description = "Path to the function deployment zip file"
  type        = string
  default     = "./function.zip"
}

# Logging
variable "log_level" {
  description = "Log level for functions"
  type        = string
  default     = "info"
}

# Custom Domain
variable "custom_domain" {
  description = "Custom domain hostname for the API gateway (e.g. api.example.com). Requires a CNAME record pointing to the gateway domain. Leave empty to skip."
  type        = string
  default     = ""
}
