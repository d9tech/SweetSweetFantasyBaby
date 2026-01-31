# Development Environment Configuration
# This is the entry point for deploying the dev environment

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Uncomment for remote state (recommended for team collaboration)
  # backend "s3" {
  #   bucket         = "your-terraform-state-bucket"
  #   key            = "dev/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = "dev"
      Project     = "cross-platform-app"
      ManagedBy   = "terraform"
    }
  }
}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name (used for resource naming)"
  type        = string
  default     = "app"
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# VPC (using default VPC for dev - create custom VPC for production)
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security Group for Lambda (to access RDS)
resource "aws_security_group" "lambda" {
  name        = "${var.project_name}-lambda-sg"
  description = "Security group for Lambda functions"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name = "${var.project_name}-lambda-sg"
  }
}

# Database Module
module "database" {
  source = "../../modules/database"

  cluster_identifier = "${var.project_name}-dev"
  database_name      = "app_dev"

  vpc_id     = data.aws_vpc.default.id
  subnet_ids = data.aws_subnets.default.ids

  allowed_security_group_ids = [aws_security_group.lambda.id]

  # Dev settings (lower capacity, no deletion protection)
  min_capacity          = 0.5
  max_capacity          = 4
  deletion_protection   = false
  backup_retention_period = 1

  tags = {
    Environment = "dev"
  }
}

# Lambda Functions
# Note: In a real setup, you'd have multiple Lambda modules for different handlers

# module "api_lambda" {
#   source = "../../modules/lambda"
#
#   function_name = "${var.project_name}-api-dev"
#   description   = "API handler for dev environment"
#   source_dir    = "../../../../backend/lambdas/dist"
#
#   vpc_config = {
#     subnet_ids         = data.aws_subnets.default.ids
#     security_group_ids = [aws_security_group.lambda.id]
#   }
#
#   environment_variables = {
#     DB_SECRET_ARN = module.database.secret_arn
#     STAGE         = "dev"
#   }
#
#   tags = {
#     Environment = "dev"
#   }
# }

# Outputs
output "database_endpoint" {
  description = "Database endpoint"
  value       = module.database.cluster_endpoint
}

output "database_secret_arn" {
  description = "ARN of the database credentials secret"
  value       = module.database.secret_arn
}

output "region" {
  description = "AWS region"
  value       = data.aws_region.current.name
}

output "account_id" {
  description = "AWS account ID"
  value       = data.aws_caller_identity.current.account_id
}
