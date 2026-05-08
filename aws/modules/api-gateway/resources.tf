# ===================
# API Gateway Resources (Path Definitions)
# ===================

# /v1 resource
resource "aws_api_gateway_resource" "v1" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "v1"
}

# ===================
# Applications Resources
# ===================

# /v1/applications
resource "aws_api_gateway_resource" "applications" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "applications"
}

# /v1/applications/{applicationId}
resource "aws_api_gateway_resource" "application" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.applications.id
  path_part   = "{applicationId}"
}

# /v1/applications/{applicationId}/stats
resource "aws_api_gateway_resource" "application_stats" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.application.id
  path_part   = "stats"
}

# /v1/applications/{applicationId}/versions
resource "aws_api_gateway_resource" "versions" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.application.id
  path_part   = "versions"
}

# /v1/applications/{applicationId}/versions/{version}
resource "aws_api_gateway_resource" "version" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.versions.id
  path_part   = "{version}"
}

# /v1/applications/{applicationId}/versions/{version}/files
resource "aws_api_gateway_resource" "files" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.version.id
  path_part   = "files"
}

# ===================
# Downloads Resources
# ===================

# /v1/downloads
resource "aws_api_gateway_resource" "downloads" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "downloads"
}

# /v1/downloads/url
resource "aws_api_gateway_resource" "download_url" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.downloads.id
  path_part   = "url"
}

# /v1/downloads/share
resource "aws_api_gateway_resource" "download_share" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.downloads.id
  path_part   = "share"
}

# /v1/downloads/d
resource "aws_api_gateway_resource" "download_public" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.downloads.id
  path_part   = "d"
}

# /v1/downloads/d/{token}
resource "aws_api_gateway_resource" "download_token" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.download_public.id
  path_part   = "{token}"
}

# ===================
# Management Resources
# ===================

# /v1/management
resource "aws_api_gateway_resource" "management" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "management"
}

# /v1/management/applications
resource "aws_api_gateway_resource" "management_applications" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.management.id
  path_part   = "applications"
}

# /v1/management/applications/{applicationId}
resource "aws_api_gateway_resource" "management_application" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.management_applications.id
  path_part   = "{applicationId}"
}

# /v1/management/applications/{applicationId}/customers
resource "aws_api_gateway_resource" "application_customers" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.management_application.id
  path_part   = "customers"
}

# /v1/management/upload
resource "aws_api_gateway_resource" "upload" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.management.id
  path_part   = "upload"
}

# /v1/management/upload/large-url
resource "aws_api_gateway_resource" "large_url" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.upload.id
  path_part   = "large-url"
}

# /v1/management/upload/large-complete
resource "aws_api_gateway_resource" "large_complete" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.upload.id
  path_part   = "large-complete"
}

# /v1/management/customers
resource "aws_api_gateway_resource" "customers" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.management.id
  path_part   = "customers"
}

# /v1/management/customers/{customerId}
resource "aws_api_gateway_resource" "customer" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.customers.id
  path_part   = "{customerId}"
}

# /v1/management/customers/{customerId}/apikeys
resource "aws_api_gateway_resource" "apikeys" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.customer.id
  path_part   = "apikeys"
}

# /v1/management/customers/{customerId}/regenerate-key
resource "aws_api_gateway_resource" "regenerate_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.customer.id
  path_part   = "regenerate-key"
}

# /v1/management/admin
resource "aws_api_gateway_resource" "admin" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.management.id
  path_part   = "admin"
}

# /v1/management/admin/regenerate-key
resource "aws_api_gateway_resource" "admin_regenerate_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "regenerate-key"
}

# /v1/management/admin/regenerate-apps-key
resource "aws_api_gateway_resource" "admin_regenerate_apps_key" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "regenerate-apps-key"
}

# ===================
# Activity Resources
# ===================

# /v1/activity
resource "aws_api_gateway_resource" "activity" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "activity"
}

# /v1/audit
resource "aws_api_gateway_resource" "audit" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.v1.id
  path_part   = "audit"
}
