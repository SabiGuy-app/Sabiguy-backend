variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "parameters" {
  description = "Map of parameter names to values"
  type        = map(string)
  
}