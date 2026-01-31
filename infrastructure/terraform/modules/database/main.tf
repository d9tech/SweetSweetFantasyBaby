# Aurora PostgreSQL Serverless v2 Module
# This module creates an Aurora Serverless v2 cluster with multilingual support

variable "cluster_identifier" {
  description = "Identifier for the Aurora cluster"
  type        = string
}

variable "database_name" {
  description = "Name of the default database"
  type        = string
  default     = "app"
}

variable "master_username" {
  description = "Master username for the database"
  type        = string
  default     = "postgres"
}

variable "vpc_id" {
  description = "VPC ID where the database will be created"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for the database (should be private subnets)"
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to connect to the database"
  type        = list(string)
  default     = []
}

variable "min_capacity" {
  description = "Minimum ACU capacity (0.5 is the lowest)"
  type        = number
  default     = 0.5
}

variable "max_capacity" {
  description = "Maximum ACU capacity"
  type        = number
  default     = 16
}

variable "backup_retention_period" {
  description = "Days to retain backups"
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = false  # Set to true for production
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

# Generate a random password for the master user
resource "random_password" "master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Store password in Secrets Manager
resource "aws_secretsmanager_secret" "db_credentials" {
  name = "${var.cluster_identifier}-credentials"
  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.master_username
    password = random_password.master.result
    host     = aws_rds_cluster.this.endpoint
    port     = aws_rds_cluster.this.port
    database = var.database_name
  })
}

# DB Subnet Group
resource "aws_db_subnet_group" "this" {
  name       = "${var.cluster_identifier}-subnet-group"
  subnet_ids = var.subnet_ids

  tags = merge(var.tags, {
    Name = "${var.cluster_identifier}-subnet-group"
  })
}

# Security Group for Aurora
resource "aws_security_group" "aurora" {
  name        = "${var.cluster_identifier}-aurora-sg"
  description = "Security group for Aurora cluster"
  vpc_id      = var.vpc_id

  # Allow inbound PostgreSQL from specified security groups
  dynamic "ingress" {
    for_each = var.allowed_security_group_ids
    content {
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [ingress.value]
      description     = "PostgreSQL from allowed security groups"
    }
  }

  # Allow all outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_identifier}-aurora-sg"
  })
}

# Aurora Cluster
resource "aws_rds_cluster" "this" {
  cluster_identifier = var.cluster_identifier

  engine         = "aurora-postgresql"
  engine_mode    = "provisioned"  # Serverless v2 uses provisioned mode
  engine_version = "15.4"

  database_name   = var.database_name
  master_username = var.master_username
  master_password = random_password.master.result

  # Serverless v2 scaling configuration
  serverlessv2_scaling_configuration {
    min_capacity = var.min_capacity
    max_capacity = var.max_capacity
  }

  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.aurora.id]

  # Backup configuration
  backup_retention_period = var.backup_retention_period
  preferred_backup_window = "03:00-04:00"

  # Maintenance window
  preferred_maintenance_window = "sun:04:00-sun:05:00"

  # Storage encryption (always enabled for production)
  storage_encrypted = true

  # Deletion protection
  deletion_protection = var.deletion_protection
  skip_final_snapshot = !var.deletion_protection
  final_snapshot_identifier = var.deletion_protection ? "${var.cluster_identifier}-final-snapshot" : null

  # Enable enhanced monitoring
  # Note: Requires an IAM role for enhanced monitoring

  # Enable Performance Insights
  # Note: Add performance_insights_enabled = true for production

  tags = var.tags
}

# Aurora Instance (Serverless v2)
resource "aws_rds_cluster_instance" "this" {
  identifier         = "${var.cluster_identifier}-instance-1"
  cluster_identifier = aws_rds_cluster.this.id

  instance_class = "db.serverless"  # Required for Serverless v2
  engine         = aws_rds_cluster.this.engine
  engine_version = aws_rds_cluster.this.engine_version

  # Use the same subnet group
  db_subnet_group_name = aws_db_subnet_group.this.name

  # Monitoring
  monitoring_interval = 60  # Enhanced monitoring every 60 seconds
  # monitoring_role_arn = aws_iam_role.rds_monitoring.arn  # Add for enhanced monitoring

  # Performance Insights
  performance_insights_enabled = true
  performance_insights_retention_period = 7  # Days

  tags = var.tags
}

# Outputs
output "cluster_endpoint" {
  description = "Writer endpoint for the cluster"
  value       = aws_rds_cluster.this.endpoint
}

output "cluster_reader_endpoint" {
  description = "Reader endpoint for the cluster"
  value       = aws_rds_cluster.this.reader_endpoint
}

output "cluster_port" {
  description = "Port for the cluster"
  value       = aws_rds_cluster.this.port
}

output "cluster_id" {
  description = "Cluster identifier"
  value       = aws_rds_cluster.this.id
}

output "security_group_id" {
  description = "Security group ID for the Aurora cluster"
  value       = aws_security_group.aurora.id
}

output "secret_arn" {
  description = "ARN of the Secrets Manager secret containing credentials"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "database_name" {
  description = "Name of the default database"
  value       = var.database_name
}
