module "vpc" {
  source = "./modules/vpc"

  project_name        = var.project_name
  environment         = var.environment
  vpc_cidr            = var.vpc_cidr
  public_subnet_cidr  = var.public_subnet_cidr
  private_subnet_cidr = var.private_subnet_cidr
}

module "ec2" {
  source = "./modules/ec2"

  project_name         = var.project_name
  environment          = var.environment
  instance_type        = var.instance_type
  subnet_id            = module.vpc.public_subnet_id
  security_group_id    = module.vpc.ec2_security_group_id
  key_pair_name        = var.key_pair_name
  iam_instance_profile = module.ec2.iam_instance_profile
}

module "ecr" {
  source = "./modules/ecr"

  project_name = var.project_name
  environment  = var.environment
}

module "api_gateway" {
  source = "./modules/api_gateway"

  project_name  = var.project_name
  environment   = var.environment
  ec2_public_ip = module.ec2.public_ip
}

module "ssm" {
  source = "./modules/ssm"

  project_name = var.project_name
  environment  = var.environment
  parameters   = {}
}

module "monitoring" {
  source = "./modules/monitoring"

  project_name = var.project_name
  environment  = var.environment
  instance_id  = module.ec2.instance_id
  alarm_email  = "your-email@company.com"
}