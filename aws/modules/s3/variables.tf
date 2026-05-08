variable "name_prefix" {
  description = "Prefix for resource names (e.g., 'myapp-dev')"
  type        = string
}

variable "account_id" {
  description = "AWS Account ID for globally unique bucket names"
  type        = string
}

variable "versioning_enabled" {
  description = "Enable S3 versioning for the applications bucket"
  type        = bool
  default     = true
}

variable "lifecycle_glacier_days" {
  description = "Days before moving old versions to Glacier (0 to disable)"
  type        = number
  default     = 90
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
