variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "min_cpu" {
  description = "Minimum vCPU (0 for scale-to-zero)"
  type        = number
  default     = 0
}

variable "max_cpu" {
  description = "Maximum vCPU"
  type        = number
  default     = 4
}
