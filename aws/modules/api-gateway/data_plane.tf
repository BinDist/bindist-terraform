# ===================
# API Methods
# ===================

# GET /v1/applications - List applications
resource "aws_api_gateway_method" "list_applications" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.applications.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.querystring.page"     = false
    "method.request.querystring.pageSize" = false
    "method.request.querystring.search"   = false
    "method.request.querystring.tags"     = false
  }
}

resource "aws_api_gateway_integration" "list_applications" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.applications.id
  http_method             = aws_api_gateway_method.list_applications.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["listApplications"]
}

# GET /v1/applications/{applicationId} - Get application
resource "aws_api_gateway_method" "get_application" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.application.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.path.applicationId" = true
  }
}

resource "aws_api_gateway_integration" "get_application" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.application.id
  http_method             = aws_api_gateway_method.get_application.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["getApplication"]
}

# GET /v1/applications/{applicationId}/stats - Get application statistics
resource "aws_api_gateway_method" "get_application_stats" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.application_stats.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.path.applicationId" = true
  }
}

resource "aws_api_gateway_integration" "get_application_stats" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.application_stats.id
  http_method             = aws_api_gateway_method.get_application_stats.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["getApplicationStats"]
}

# GET /v1/applications/{applicationId}/versions - List versions
resource "aws_api_gateway_method" "list_versions" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.versions.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.path.applicationId" = true
  }
}

resource "aws_api_gateway_integration" "list_versions" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.versions.id
  http_method             = aws_api_gateway_method.list_versions.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["listVersions"]
}

# GET /v1/applications/{applicationId}/versions/{version}/files - List files
resource "aws_api_gateway_method" "list_version_files" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.files.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.path.applicationId" = true
    "method.request.path.version"       = true
  }
}

resource "aws_api_gateway_integration" "list_version_files" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.files.id
  http_method             = aws_api_gateway_method.list_version_files.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["listVersionFiles"]
}

# PATCH /v1/applications/{applicationId}/versions/{version} - Update version
resource "aws_api_gateway_method" "update_version" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.version.id
  http_method   = "PATCH"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.path.applicationId" = true
    "method.request.path.version"       = true
  }
}

resource "aws_api_gateway_integration" "update_version" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.version.id
  http_method             = aws_api_gateway_method.update_version.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["updateVersion"]
}

# OPTIONS /v1/applications/{applicationId}/versions/{version} (CORS)
resource "aws_api_gateway_method" "options_version" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.version.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_version" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.version.id
  http_method = aws_api_gateway_method.options_version.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_version" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.version.id
  http_method = aws_api_gateway_method.options_version.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_version" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.version.id
  http_method = aws_api_gateway_method.options_version.http_method
  status_code = aws_api_gateway_method_response.options_version.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "method.response.header.Access-Control-Allow-Methods" = "'PATCH,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_version]
}

# GET /v1/downloads/url - Get download URL
resource "aws_api_gateway_method" "get_download_url" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.download_url.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.querystring.applicationId" = true
    "method.request.querystring.version"       = true
    "method.request.querystring.fileId"        = false
  }
}

resource "aws_api_gateway_integration" "get_download_url" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.download_url.id
  http_method             = aws_api_gateway_method.get_download_url.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["getDownloadUrl"]
}

# POST /v1/downloads/share - Create share link
resource "aws_api_gateway_method" "create_share_link" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.download_share.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "create_share_link" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.download_share.id
  http_method             = aws_api_gateway_method.create_share_link.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["createShareLink"]
}

# GET /v1/downloads/d/{token} - Public download (no auth)
resource "aws_api_gateway_method" "public_download" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.download_token.id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.token" = true
  }
}

resource "aws_api_gateway_integration" "public_download" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.download_token.id
  http_method             = aws_api_gateway_method.public_download.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["publicDownload"]
}

# OPTIONS /v1/management/applications (CORS)
resource "aws_api_gateway_method" "options_management_applications" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.management_applications.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_management_applications" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.management_applications.id
  http_method = aws_api_gateway_method.options_management_applications.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_management_applications" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.management_applications.id
  http_method = aws_api_gateway_method.options_management_applications.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_management_applications" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.management_applications.id
  http_method = aws_api_gateway_method.options_management_applications.http_method
  status_code = aws_api_gateway_method_response.options_management_applications.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_management_applications]
}

# POST /v1/management/applications - Create application
resource "aws_api_gateway_method" "create_application" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.management_applications.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "create_application" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.management_applications.id
  http_method             = aws_api_gateway_method.create_application.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["createApplication"]
}

# DELETE /v1/management/applications/{applicationId} - Delete application (soft delete)
resource "aws_api_gateway_method" "delete_application" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.management_application.id
  http_method   = "DELETE"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.path.applicationId" = true
  }
}

resource "aws_api_gateway_integration" "delete_application" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.management_application.id
  http_method             = aws_api_gateway_method.delete_application.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["deleteApplication"]
}

# OPTIONS /v1/management/applications/{applicationId} (CORS)
resource "aws_api_gateway_method" "options_management_application" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.management_application.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_management_application" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.management_application.id
  http_method = aws_api_gateway_method.options_management_application.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_management_application" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.management_application.id
  http_method = aws_api_gateway_method.options_management_application.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_management_application" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.management_application.id
  http_method = aws_api_gateway_method.options_management_application.http_method
  status_code = aws_api_gateway_method_response.options_management_application.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "method.response.header.Access-Control-Allow-Methods" = "'DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_management_application]
}

# POST /v1/management/upload - Upload binary
resource "aws_api_gateway_method" "upload_binary" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.upload.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "upload_binary" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.upload.id
  http_method             = aws_api_gateway_method.upload_binary.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["uploadBinary"]
}

# POST /v1/management/upload/large-url - Get large upload URL
resource "aws_api_gateway_method" "get_large_upload_url" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.large_url.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "get_large_upload_url" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.large_url.id
  http_method             = aws_api_gateway_method.get_large_upload_url.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["getLargeUploadUrl"]
}

# POST /v1/management/upload/large-complete - Complete large upload
resource "aws_api_gateway_method" "complete_large_upload" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.large_complete.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "complete_large_upload" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.large_complete.id
  http_method             = aws_api_gateway_method.complete_large_upload.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["completeLargeUpload"]
}

# POST /v1/management/customers/{customerId}/apikeys - Create API key
resource "aws_api_gateway_method" "create_api_key" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.apikeys.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.path.customerId" = true
  }
}

resource "aws_api_gateway_integration" "create_api_key" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.apikeys.id
  http_method             = aws_api_gateway_method.create_api_key.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["createApiKey"]
}

# GET /v1/management/customers - List customers (admin only)
resource "aws_api_gateway_method" "list_customers" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.customers.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "list_customers" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.customers.id
  http_method             = aws_api_gateway_method.list_customers.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["listCustomers"]
}

# PATCH /v1/management/customers/{customerId} - Update customer (admin only)
resource "aws_api_gateway_method" "update_customer" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.customer.id
  http_method   = "PATCH"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.path.customerId" = true
  }
}

resource "aws_api_gateway_integration" "update_customer" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.customer.id
  http_method             = aws_api_gateway_method.update_customer.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["updateCustomer"]
}

# POST /v1/management/customers/{customerId}/regenerate-key - Regenerate API key (admin only)
resource "aws_api_gateway_method" "regenerate_customer_key" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.regenerate_key.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.path.customerId" = true
  }
}

resource "aws_api_gateway_integration" "regenerate_customer_key" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.regenerate_key.id
  http_method             = aws_api_gateway_method.regenerate_customer_key.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["regenerateCustomerKey"]
}

# OPTIONS /v1/management/customers/{customerId} (CORS)
resource "aws_api_gateway_method" "options_customer" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.customer.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_customer" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.customer.id
  http_method = aws_api_gateway_method.options_customer.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_customer" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.customer.id
  http_method = aws_api_gateway_method.options_customer.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_customer" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.customer.id
  http_method = aws_api_gateway_method.options_customer.http_method
  status_code = aws_api_gateway_method_response.options_customer.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "method.response.header.Access-Control-Allow-Methods" = "'PATCH,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_customer]
}

# OPTIONS /v1/management/customers/{customerId}/regenerate-key (CORS)
resource "aws_api_gateway_method" "options_regenerate_key" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.regenerate_key.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_regenerate_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.regenerate_key.id
  http_method = aws_api_gateway_method.options_regenerate_key.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_regenerate_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.regenerate_key.id
  http_method = aws_api_gateway_method.options_regenerate_key.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_regenerate_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.regenerate_key.id
  http_method = aws_api_gateway_method.options_regenerate_key.http_method
  status_code = aws_api_gateway_method_response.options_regenerate_key.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_regenerate_key]
}

# POST /v1/management/admin/regenerate-key - Regenerate admin API key (admin only)
resource "aws_api_gateway_method" "regenerate_admin_key" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_regenerate_key.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "regenerate_admin_key" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_regenerate_key.id
  http_method             = aws_api_gateway_method.regenerate_admin_key.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["regenerateAdminKey"]
}

# OPTIONS /v1/management/admin/regenerate-key (CORS)
resource "aws_api_gateway_method" "options_admin_regenerate_key" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_regenerate_key.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_admin_regenerate_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_regenerate_key.id
  http_method = aws_api_gateway_method.options_admin_regenerate_key.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_admin_regenerate_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_regenerate_key.id
  http_method = aws_api_gateway_method.options_admin_regenerate_key.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_admin_regenerate_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_regenerate_key.id
  http_method = aws_api_gateway_method.options_admin_regenerate_key.http_method
  status_code = aws_api_gateway_method_response.options_admin_regenerate_key.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_admin_regenerate_key]
}

# POST /v1/management/admin/regenerate-apps-key - Regenerate apps-admin API key (super admin only)
resource "aws_api_gateway_method" "regenerate_apps_admin_key" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_regenerate_apps_key.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id
}

resource "aws_api_gateway_integration" "regenerate_apps_admin_key" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.admin_regenerate_apps_key.id
  http_method             = aws_api_gateway_method.regenerate_apps_admin_key.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["regenerateAppsAdminKey"]
}

# OPTIONS /v1/management/admin/regenerate-apps-key (CORS)
resource "aws_api_gateway_method" "options_admin_regenerate_apps_key" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.admin_regenerate_apps_key.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_admin_regenerate_apps_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_regenerate_apps_key.id
  http_method = aws_api_gateway_method.options_admin_regenerate_apps_key.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_admin_regenerate_apps_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_regenerate_apps_key.id
  http_method = aws_api_gateway_method.options_admin_regenerate_apps_key.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_admin_regenerate_apps_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.admin_regenerate_apps_key.id
  http_method = aws_api_gateway_method.options_admin_regenerate_apps_key.http_method
  status_code = aws_api_gateway_method_response.options_admin_regenerate_apps_key.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_admin_regenerate_apps_key]
}

# PUT /v1/management/applications/{applicationId}/customers - Update application customers
resource "aws_api_gateway_method" "update_application_customers" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.application_customers.id
  http_method   = "PUT"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.path.applicationId" = true
  }
}

resource "aws_api_gateway_integration" "update_application_customers" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.application_customers.id
  http_method             = aws_api_gateway_method.update_application_customers.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["updateApplicationCustomers"]
}

# OPTIONS /v1/management/applications/{applicationId}/customers (CORS)
resource "aws_api_gateway_method" "options_application_customers" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.application_customers.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_application_customers" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.application_customers.id
  http_method = aws_api_gateway_method.options_application_customers.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_application_customers" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.application_customers.id
  http_method = aws_api_gateway_method.options_application_customers.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_application_customers" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.application_customers.id
  http_method = aws_api_gateway_method.options_application_customers.http_method
  status_code = aws_api_gateway_method_response.options_application_customers.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "method.response.header.Access-Control-Allow-Methods" = "'PUT,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_application_customers]
}

# ===================
# Activity Endpoints
# ===================

# GET /v1/activity - List activity (uploads and downloads)
resource "aws_api_gateway_method" "list_activity" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.activity.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.querystring.type"       = false
    "method.request.querystring.limit"      = false
    "method.request.querystring.customerId" = false
    "method.request.querystring.startDate"  = false
    "method.request.querystring.endDate"    = false
  }
}

resource "aws_api_gateway_integration" "list_activity" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.activity.id
  http_method             = aws_api_gateway_method.list_activity.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["listActivity"]
}

# OPTIONS /v1/activity (CORS)
resource "aws_api_gateway_method" "options_activity" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.activity.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_activity" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.activity.id
  http_method = aws_api_gateway_method.options_activity.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_activity" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.activity.id
  http_method = aws_api_gateway_method.options_activity.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_activity" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.activity.id
  http_method = aws_api_gateway_method.options_activity.http_method
  status_code = aws_api_gateway_method_response.options_activity.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_activity]
}

# ===================
# Audit Endpoints
# ===================

# GET /v1/audit - List audit events for tenant
resource "aws_api_gateway_method" "list_audit_events" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.audit.id
  http_method   = "GET"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.api_key.id

  request_parameters = {
    "method.request.querystring.eventType"   = false
    "method.request.querystring.startDate"   = false
    "method.request.querystring.endDate"     = false
    "method.request.querystring.limit"       = false
    "method.request.querystring.lastEventId" = false
  }
}

resource "aws_api_gateway_integration" "list_audit_events" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.audit.id
  http_method             = aws_api_gateway_method.list_audit_events.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns["listAuditEvents"]
}

# OPTIONS /v1/audit (CORS)
resource "aws_api_gateway_method" "options_audit" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.audit.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options_audit" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.audit.id
  http_method = aws_api_gateway_method.options_audit.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_audit" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.audit.id
  http_method = aws_api_gateway_method.options_audit.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "options_audit" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.audit.id
  http_method = aws_api_gateway_method.options_audit.http_method
  status_code = aws_api_gateway_method_response.options_audit.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Channel'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.options_audit]
}

