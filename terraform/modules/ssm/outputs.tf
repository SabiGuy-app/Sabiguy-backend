output "parameter_names" {
  description = "List of SSM parameter names"
  value       = [for p in aws_ssm_parameter.params : p.name]
}