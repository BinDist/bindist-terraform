# ===================
# REST API Core
# ===================

resource "aws_api_gateway_rest_api" "main" {
  name        = "${var.name_prefix}-api"
  description = "Application Distribution API"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

# Custom authorizer
resource "aws_api_gateway_authorizer" "api_key" {
  name                             = "api-key-authorizer"
  rest_api_id                      = aws_api_gateway_rest_api.main.id
  authorizer_uri                   = var.authorizer_invoke_arn
  type                             = "TOKEN"
  identity_source                  = "method.request.header.Authorization"
  authorizer_result_ttl_in_seconds = 60
}

# ===================
# Gateway Responses (CORS for error responses)
# ===================

resource "aws_api_gateway_gateway_response" "unauthorized" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "UNAUTHORIZED"
  status_code   = "401"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
  }

  response_templates = {
    "application/json" = "{\"success\":false,\"error\":{\"code\":\"UNAUTHORIZED\",\"message\":\"$context.authorizer.errorMessage\"}}"
  }
}

resource "aws_api_gateway_gateway_response" "access_denied" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "ACCESS_DENIED"
  status_code   = "403"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
  }

  response_templates = {
    "application/json" = "{\"success\":false,\"error\":{\"code\":\"ACCESS_DENIED\",\"message\":\"Access denied\"}}"
  }
}

resource "aws_api_gateway_gateway_response" "default_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
  }

  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }
}

resource "aws_api_gateway_gateway_response" "default_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
  }

  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }
}

# ===================
# Deployment
# ===================

resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  triggers = {
    redeployment = sha1(jsonencode([
      # Resources
      aws_api_gateway_resource.v1.id,
      aws_api_gateway_resource.applications.id,
      aws_api_gateway_resource.application.id,
      aws_api_gateway_resource.application_stats.id,
      aws_api_gateway_resource.versions.id,
      aws_api_gateway_resource.version.id,
      aws_api_gateway_resource.files.id,
      aws_api_gateway_resource.downloads.id,
      aws_api_gateway_resource.download_url.id,
      aws_api_gateway_resource.download_share.id,
      aws_api_gateway_resource.download_public.id,
      aws_api_gateway_resource.download_token.id,
      aws_api_gateway_resource.management.id,
      aws_api_gateway_resource.management_applications.id,
      aws_api_gateway_resource.upload.id,
      aws_api_gateway_resource.large_url.id,
      aws_api_gateway_resource.large_complete.id,
      aws_api_gateway_resource.customers.id,
      aws_api_gateway_resource.customer.id,
      aws_api_gateway_resource.apikeys.id,
      aws_api_gateway_resource.regenerate_key.id,
      aws_api_gateway_resource.admin.id,
      aws_api_gateway_resource.admin_regenerate_key.id,
      aws_api_gateway_resource.admin_regenerate_apps_key.id,
      aws_api_gateway_resource.management_application.id,
      aws_api_gateway_resource.application_customers.id,
      aws_api_gateway_resource.activity.id,
      aws_api_gateway_resource.audit.id,
      # Gateway responses
      aws_api_gateway_gateway_response.unauthorized.id,
      aws_api_gateway_gateway_response.access_denied.id,
      aws_api_gateway_gateway_response.default_4xx.id,
      aws_api_gateway_gateway_response.default_5xx.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  # Ensure all integrations are created before deployment
  depends_on = [
    # Data plane integrations
    aws_api_gateway_integration.list_applications,
    aws_api_gateway_integration.get_application,
    aws_api_gateway_integration.get_application_stats,
    aws_api_gateway_integration.list_versions,
    aws_api_gateway_integration.list_version_files,
    aws_api_gateway_integration.update_version,
    aws_api_gateway_integration.get_download_url,
    aws_api_gateway_integration.create_share_link,
    aws_api_gateway_integration.public_download,
    aws_api_gateway_integration.create_application,
    aws_api_gateway_integration.delete_application,
    aws_api_gateway_integration.upload_binary,
    aws_api_gateway_integration.get_large_upload_url,
    aws_api_gateway_integration.complete_large_upload,
    aws_api_gateway_integration.list_customers,
    aws_api_gateway_integration.update_customer,
    aws_api_gateway_integration.create_api_key,
    aws_api_gateway_integration.regenerate_customer_key,
    aws_api_gateway_integration.regenerate_admin_key,
    aws_api_gateway_integration.regenerate_apps_admin_key,
    aws_api_gateway_integration.update_application_customers,
    aws_api_gateway_integration.list_activity,
    aws_api_gateway_integration.list_audit_events,
    # CORS OPTIONS integrations
    aws_api_gateway_integration.options_applications,
    aws_api_gateway_integration.options_application,
    aws_api_gateway_integration.options_application_stats,
    aws_api_gateway_integration.options_versions,
    aws_api_gateway_integration.options_files,
    aws_api_gateway_integration.options_download_url,
    aws_api_gateway_integration.options_download_share,
    aws_api_gateway_integration.options_customers,
    aws_api_gateway_integration.options_apikeys,
    aws_api_gateway_integration.options_version,
    aws_api_gateway_integration.options_management_applications,
    aws_api_gateway_integration.options_management_application,
    aws_api_gateway_integration.options_customer,
    aws_api_gateway_integration.options_regenerate_key,
    aws_api_gateway_integration.options_admin_regenerate_key,
    aws_api_gateway_integration.options_admin_regenerate_apps_key,
    aws_api_gateway_integration.options_application_customers,
    aws_api_gateway_integration.options_activity,
    aws_api_gateway_integration.options_audit,
  ]
}

# ===================
# Stage
# ===================

resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = var.environment

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      caller           = "$context.identity.caller"
      user             = "$context.identity.user"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      resourcePath     = "$context.resourcePath"
      status           = "$context.status"
      protocol         = "$context.protocol"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }
}

# CloudWatch log group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/api-gateway/${var.name_prefix}"
  retention_in_days = 30
}

# Method settings for throttling
resource "aws_api_gateway_method_settings" "all" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  method_path = "*/*"

  settings {
    throttling_rate_limit  = var.throttling_rate_limit
    throttling_burst_limit = var.throttling_burst_limit
    metrics_enabled        = true
    logging_level          = "INFO"
  }
}
