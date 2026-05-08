output "alerts_topic_arn" {
  description = "SNS topic ARN for alerts"
  value       = aws_sns_topic.alerts.arn
}

output "alerts_topic_name" {
  description = "SNS topic name for alerts"
  value       = aws_sns_topic.alerts.name
}

output "lambda_log_group_arn" {
  description = "CloudWatch log group ARN for Lambda functions"
  value       = aws_cloudwatch_log_group.lambda.arn
}

output "lambda_log_group_name" {
  description = "CloudWatch log group name for Lambda functions"
  value       = aws_cloudwatch_log_group.lambda.name
}

output "dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}
