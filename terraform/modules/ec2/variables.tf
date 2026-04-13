variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t2.micro"
}

variable "subnet_id" {
  description = "Subnet ID to launch instance in"
  type        = string
}

variable "security_group_id" {
  description = "Security group ID for EC2"
  type        = string
}

variable "key_pair_name" {
  description = "Key pair name for SSH access"
  type        = string
}


# ECR image URI passed in from root module
variable "ecr_image_uri" {
  description = "Full ECR image URI to run"
  type        = string
}

# CloudWatch log group name passed in from monitoring module
variable "log_group_name" {
  description = "CloudWatch log group name for container logs"
  type        = string
}