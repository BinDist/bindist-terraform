variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "alert_email" {
  description = "Email address for alerts"
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "enable_4xx_alarm" {
  description = "Enable CloudWatch alarm for API Gateway 4xx errors"
  type        = bool
  default     = false
}
