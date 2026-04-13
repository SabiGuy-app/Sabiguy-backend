module "vpc" {
  source = "./modules/vpc"

  project_name        = var.project_name
  environment         = var.environment
  vpc_cidr            = var.vpc_cidr
  public_subnet_cidr  = var.public_subnet_cidr
  private_subnet_cidr = var.private_subnet_cidr
}

module "monitoring" {
  source = "./modules/monitoring"

  project_name = var.project_name
  environment  = var.environment
  instance_id  = module.ec2.instance_id
  alarm_email  = var.alarm_email
}

module "ecr" {
  source = "./modules/ecr"

  project_name = var.project_name
  environment  = var.environment
}

module "ec2" {
  source = "./modules/ec2"

  project_name      = var.project_name
  environment       = var.environment
  instance_type     = var.instance_type
  subnet_id         = module.vpc.public_subnet_id
  security_group_id = module.vpc.ec2_security_group_id
  key_pair_name     = var.key_pair_name

  # Pass ECR image URI and CloudWatch log group from other modules
  ecr_image_uri  = module.ecr.repository_url
  log_group_name = module.monitoring.log_group_name
}

module "api_gateway" {
  source = "./modules/api_gateway"

  project_name  = var.project_name
  environment   = var.environment
  ec2_public_ip = module.ec2.public_ip
}