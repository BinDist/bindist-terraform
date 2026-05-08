variable "name_prefix" {
  description = "Prefix for resource names (e.g., 'myapp-dev')"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g., 'dev', 'prod')"
  type        = string
}

variable "throttling_rate_limit" {
  description = "API throttling rate limit (requests per second)"
  type        = number
  default     = 100
}

variable "throttling_burst_limit" {
  description = "API throttling burst limit"
  type        = number
  default     = 200
}

variable "cors_allowed_origins" {
  description = "CORS allowed origins"
  type        = list(string)
  default     = ["*"]
}

variable "lambda_functions" {
  description = "Map of Lambda function ARNs"
  type        = map(string)
}

variable "lambda_invoke_arns" {
  description = "Map of Lambda invoke ARNs"
  type        = map(string)
}

variable "authorizer_invoke_arn" {
  description = "Authorizer Lambda invoke ARN"
  type        = string
}
