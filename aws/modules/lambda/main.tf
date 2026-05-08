# =============================================================================
# Lambda Functions for Application Distribution
# =============================================================================

locals {
  # Data plane functions
  functions = {
    authorizer                 = { handler = "functions/authorizer/index.handler", description = "API key authorizer" }
    listApplications           = { handler = "functions/listApplications/index.handler", description = "List applications" }
    getApplication             = { handler = "functions/getApplication/index.handler", description = "Get application details" }
    createApplication          = { handler = "functions/createApplication/index.handler", description = "Create application" }
    deleteApplication          = { handler = "functions/deleteApplication/index.handler", description = "Delete application (soft delete)" }
    listVersions               = { handler = "functions/listVersions/index.handler", description = "List application versions" }
    listVersionFiles           = { handler = "functions/listVersionFiles/index.handler", description = "List version files" }
    getDownloadUrl             = { handler = "functions/getDownloadUrl/index.handler", description = "Generate download URL" }
    createShareLink            = { handler = "functions/createShareLink/index.handler", description = "Create shareable download link" }
    publicDownload             = { handler = "functions/publicDownload/index.handler", description = "Public download via share token" }
    uploadBinary               = { handler = "functions/uploadBinary/index.handler", description = "Upload binary file", timeout = 300 }
    getLargeUploadUrl          = { handler = "functions/getLargeUploadUrl/index.handler", description = "Get large file upload URL" }
    completeLargeUpload        = { handler = "functions/completeLargeUpload/index.handler", description = "Complete large file upload" }
    createApiKey               = { handler = "functions/createApiKey/index.handler", description = "Create API key for customer" }
    listCustomers              = { handler = "functions/listCustomers/index.handler", description = "List customers (admin only)" }
    updateCustomer             = { handler = "functions/updateCustomer/index.handler", description = "Update customer (admin only)" }
    regenerateCustomerKey      = { handler = "functions/regenerateCustomerKey/index.handler", description = "Regenerate customer API key (admin only)" }
    regenerateAdminKey         = { handler = "functions/regenerateAdminKey/index.handler", description = "Regenerate admin API key (admin only)" }
    regenerateAppsAdminKey     = { handler = "functions/regenerateAppsAdminKey/index.handler", description = "Regenerate apps-admin API key (super admin only)" }
    updateApplicationCustomers = { handler = "functions/updateApplicationCustomers/index.handler", description = "Update application customers (admin only)" }
    getApplicationStats        = { handler = "functions/getApplicationStats/index.handler", description = "Get application download statistics" }
    updateVersion              = { handler = "functions/updateVersion/index.handler", description = "Update version metadata (admin only)" }
    listActivity               = { handler = "functions/listActivity/index.handler", description = "List activity (uploads and downloads)" }
    listAuditEvents            = { handler = "functions/listAuditEvents/index.handler", description = "List audit events" }
  }
}

# IAM role for Lambda execution
resource "aws_iam_role" "lambda_execution" {
  name = "${var.name_prefix}-lambda-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# Basic Lambda execution policy (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# X-Ray tracing policy
resource "aws_iam_role_policy_attachment" "lambda_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# DynamoDB access policy
resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${var.name_prefix}-lambda-dynamodb"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = var.dynamodb_table_arns
      }
    ]
  })
}

# S3 access policy
resource "aws_iam_role_policy" "lambda_s3" {
  name = "${var.name_prefix}-lambda-s3"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetObjectVersion",
          "s3:GetObjectTagging",
          "s3:PutObjectTagging"
        ]
        Resource = var.s3_bucket_arns
      }
    ]
  })
}

# CloudWatch metrics access policy (for quota checking)
resource "aws_iam_role_policy" "lambda_cloudwatch_metrics" {
  name = "${var.name_prefix}-lambda-cloudwatch-metrics"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:GetMetricData"
        ]
        Resource = "*"
      }
    ]
  })
}

# Placeholder Lambda package (will be replaced by actual deployment)
data "archive_file" "placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 501, body: 'Not deployed' });"
    filename = "index.js"
  }
}

# Lambda functions
resource "aws_lambda_function" "functions" {
  for_each = local.functions

  function_name = "${var.name_prefix}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.lambda_execution.arn
  handler       = each.value.handler
  runtime       = var.runtime
  memory_size   = lookup(each.value, "memory", var.memory_size)
  timeout       = lookup(each.value, "timeout", var.timeout)

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = var.environment_variables
  }

  dynamic "tracing_config" {
    for_each = var.enable_xray ? [1] : []
    content {
      mode = "Active"
    }
  }

  lifecycle {
    ignore_changes = [
      filename,
      source_code_hash,
    ]
  }

  tags = var.tags
}

# CloudWatch Log Groups for each function
resource "aws_cloudwatch_log_group" "functions" {
  for_each = local.functions

  name              = "/aws/lambda/${var.name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# Lambda permissions for API Gateway invocation
resource "aws_lambda_permission" "api_gateway" {
  for_each = local.functions

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions[each.key].function_name
  principal     = "apigateway.amazonaws.com"
}
