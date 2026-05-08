output "gateway_url" {
  description = "API gateway function endpoint URL (custom domain if configured, otherwise default)"
  value       = var.custom_domain != "" ? var.custom_domain : scaleway_function.api_gateway.domain_name
}

output "gateway_domain_name" {
  description = "Default Scaleway domain name for the API gateway (use as CNAME target for custom domains)"
  value       = scaleway_function.api_gateway.domain_name
}

output "namespace_id" {
  description = "Function namespace ID"
  value       = scaleway_function_namespace.main.id
}

output "function_id" {
  description = "API gateway function ID"
  value       = scaleway_function.api_gateway.id
}
