# Lambda Function Module
# This module creates a Lambda function with best practices for serverless APIs

variable "function_name" {
  description = "Name of the Lambda function"
  type        = string
}

variable "description" {
  description = "Description of the Lambda function"
  type        = string
  default     = ""
}

variable "handler" {
  description = "Handler function (e.g., index.handler)"
  type        = string
  default     = "index.handler"
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs20.x"
}

variable "memory_size" {
  description = "Memory allocation in MB (also affects CPU)"
  type        = number
  default     = 256
}

variable "timeout" {
  description = "Timeout in seconds"
  type        = number
  default     = 30
}

variable "environment_variables" {
  description = "Environment variables for the function"
  type        = map(string)
  default     = {}
}

variable "source_dir" {
  description = "Directory containing the Lambda code"
  type        = string
}

variable "vpc_config" {
  description = "VPC configuration for the Lambda (for RDS access)"
  type = object({
    subnet_ids         = list(string)
    security_group_ids = list(string)
  })
  default = null
}

variable "reserved_concurrent_executions" {
  description = "Reserved concurrency (set to guarantee capacity)"
  type        = number
  default     = -1  # -1 means unreserved
}

variable "enable_xray" {
  description = "Enable X-Ray tracing"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda" {
  name = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = var.tags
}

# Basic Lambda execution policy (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# VPC access policy (if VPC config provided)
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  count      = var.vpc_config != null ? 1 : 0
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# X-Ray policy
resource "aws_iam_role_policy_attachment" "lambda_xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# Package Lambda code
data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = "${path.module}/.builds/${var.function_name}.zip"
}

# Lambda Function
resource "aws_lambda_function" "this" {
  function_name = var.function_name
  description   = var.description
  role          = aws_iam_role.lambda.arn

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  handler = var.handler
  runtime = var.runtime

  memory_size = var.memory_size
  timeout     = var.timeout

  # Use ARM64 for better price/performance
  architectures = ["arm64"]

  environment {
    variables = merge(
      var.environment_variables,
      {
        NODE_OPTIONS = "--enable-source-maps"
      }
    )
  }

  # VPC configuration (for RDS access)
  dynamic "vpc_config" {
    for_each = var.vpc_config != null ? [var.vpc_config] : []
    content {
      subnet_ids         = vpc_config.value.subnet_ids
      security_group_ids = vpc_config.value.security_group_ids
    }
  }

  # X-Ray tracing
  dynamic "tracing_config" {
    for_each = var.enable_xray ? [1] : []
    content {
      mode = "Active"
    }
  }

  # Reserved concurrency
  reserved_concurrent_executions = var.reserved_concurrent_executions

  tags = var.tags
}

# CloudWatch Log Group (with retention)
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = 14  # Adjust based on needs

  tags = var.tags
}

# Outputs
output "function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.this.function_name
}

output "function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.this.arn
}

output "invoke_arn" {
  description = "Lambda invoke ARN (for API Gateway)"
  value       = aws_lambda_function.this.invoke_arn
}

output "role_arn" {
  description = "Lambda execution role ARN"
  value       = aws_iam_role.lambda.arn
}

output "role_name" {
  description = "Lambda execution role name"
  value       = aws_iam_role.lambda.name
}
