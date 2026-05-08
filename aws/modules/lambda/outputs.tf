output "function_names" {
  description = "Map of function names"
  value = {
    for key, func in aws_lambda_function.functions : key => func.function_name
  }
}

output "function_arns" {
  description = "Map of function ARNs"
  value = {
    for key, func in aws_lambda_function.functions : key => func.arn
  }
}

output "invoke_arns" {
  description = "Map of function invoke ARNs"
  value = {
    for key, func in aws_lambda_function.functions : key => func.invoke_arn
  }
}

output "authorizer_invoke_arn" {
  description = "Authorizer function invoke ARN"
  value       = aws_lambda_function.functions["authorizer"].invoke_arn
}

output "authorizer_function_name" {
  description = "Authorizer function name"
  value       = aws_lambda_function.functions["authorizer"].function_name
}

output "execution_role_arn" {
  description = "Lambda execution role ARN"
  value       = aws_iam_role.lambda_execution.arn
}

output "execution_role_name" {
  description = "Lambda execution role name"
  value       = aws_iam_role.lambda_execution.name
}
