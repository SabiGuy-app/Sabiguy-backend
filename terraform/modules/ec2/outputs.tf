output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.main.id
}

output "public_ip" {
  description = "EC2 public IP address"
  value       = aws_instance.main.public_ip
}

output "iam_instance_profile" {
  description = "IAM instance profile name"
  value       = aws_iam_instance_profile.ec2_profile.name
}