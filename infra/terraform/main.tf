provider "aws" {
  region = var.region
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  token                  = data.aws_eks_cluster_auth.cluster.token
}

data "aws_eks_cluster_auth" "cluster" {
  name = module.eks.cluster_name
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  cluster_name = "${var.cluster_name}-${var.environment}"
  environment = terraform.workspace
}

# VPC for EKS
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.0"

  name = "${local.cluster_name}-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["ap-southeast-1a", "ap-southeast-1b", "ap-southeast-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = false
  enable_dns_hostnames = true
  enable_dns_support   = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
    "karpenter.sh/discovery" = local.cluster_name
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
    "karpenter.sh/discovery" = local.cluster_name
  }

  tags = {
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
    "karpenter.sh/discovery" = local.cluster_name
    Environment = var.environment
  }
}

# VPC Endpoints for Karpenter nodes to communicate with AWS services
resource "aws_vpc_endpoint" "ec2" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ec2"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  
  private_dns_enabled = true
  
  tags = {
    Name = "${local.cluster_name}-ec2-endpoint"
    Environment = var.environment
  }
}

resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  
  private_dns_enabled = true
  
  tags = {
    Name = "${local.cluster_name}-ssm-endpoint"
    Environment = var.environment
  }
}

resource "aws_vpc_endpoint" "ec2messages" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ec2messages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  
  private_dns_enabled = true
  
  tags = {
    Name = "${local.cluster_name}-ec2messages-endpoint"
    Environment = var.environment
  }
}

resource "aws_vpc_endpoint" "ssmmessages" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ssmmessages"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  
  private_dns_enabled = true
  
  tags = {
    Name = "${local.cluster_name}-ssmmessages-endpoint"
    Environment = var.environment
  }
}

resource "aws_vpc_endpoint" "sts" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.sts"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  
  private_dns_enabled = true
  
  tags = {
    Name = "${local.cluster_name}-sts-endpoint"
    Environment = var.environment
  }
}

resource "aws_vpc_endpoint" "eks" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.eks"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  
  private_dns_enabled = true
  
  tags = {
    Name = "${local.cluster_name}-eks-endpoint"
    Environment = var.environment
  }
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  
  private_dns_enabled = true
  
  tags = {
    Name = "${local.cluster_name}-ecr-dkr-endpoint"
    Environment = var.environment
  }
}

resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  
  private_dns_enabled = true
  
  tags = {
    Name = "${local.cluster_name}-ecr-api-endpoint"
    Environment = var.environment
  }
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = module.vpc.vpc_id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = module.vpc.private_route_table_ids
  
  tags = {
    Name = "${local.cluster_name}-s3-endpoint"
    Environment = var.environment
  }
}

# Security Group for VPC Endpoints
resource "aws_security_group" "vpc_endpoints" {
  name        = "${local.cluster_name}-vpc-endpoints"
  description = "Security group for VPC endpoints"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }
  
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.cluster_name}-vpc-endpoints"
    Environment = var.environment
  }
}

# Get S3 prefix list for node access to S3 via gateway endpoint
data "aws_prefix_list" "s3" {
  name = "com.amazonaws.${data.aws_region.current.name}.s3"
}

# EKS Cluster
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = local.cluster_name
  cluster_version = "1.33"
  
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access = true
  cluster_endpoint_private_access = true
  enable_irsa = true

  # Single node group for all workloads
  eks_managed_node_groups = {
    main = {
      instance_types = ["t3.medium"]
      min_size       = 2
      max_size       = 4
      desired_size   = 3
      
      iam_role_additional_policies = {
        AmazonEBSCSIDriverPolicy = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
      }
      
      labels = {
        role = "main"
      }
    }
  }

  access_entries = {
    admin = {
      kubernetes_groups = []
      principal_arn     = data.aws_caller_identity.current.arn
      policy_associations = {
        admin = {
          policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = {
            type = "cluster"
          }
        }
      }
    }

  }

  tags = {
    Environment = var.environment
    Project     = "shopmate"
    "karpenter.sh/discovery" = local.cluster_name
  }

  # EKS Addons
  cluster_addons = {
    vpc-cni = {
      most_recent = true
    }
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
  }
}

# Karpenter Controller IAM Role (IRSA)
module "karpenter" {
  source  = "terraform-aws-modules/eks/aws//modules/karpenter"
  version = "~> 20.0"

  cluster_name = module.eks.cluster_name

  enable_irsa            = true
  irsa_oidc_provider_arn = module.eks.oidc_provider_arn
  irsa_namespace_service_accounts = ["karpenter:karpenter"]

  node_iam_role_additional_policies = {
    AmazonSSMManagedInstanceCore = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  }

  tags = {
    Environment = var.environment
    Project     = "shopmate"
  }

  depends_on = [module.eks]
}

# Add S3 prefix list access to EKS node security group
resource "aws_security_group_rule" "node_s3_prefix_list_egress" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  prefix_list_ids   = [data.aws_prefix_list.s3.id]
  security_group_id = module.eks.node_security_group_id
  description       = "Allow HTTPS access to S3 prefix list for ECR image layers"
}

# Allow nodes to reach VPC interface endpoints for ECR
resource "aws_security_group_rule" "node_vpc_endpoints_egress" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = [module.vpc.vpc_cidr_block]
  security_group_id = module.eks.node_security_group_id
  description       = "Allow HTTPS to VPC interface endpoints for ECR"
}

# Patch aws-node DaemonSet to tolerate Karpenter node bootstrap taints
resource "null_resource" "aws_node_patch" {
  provisioner "local-exec" {
    command = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name} && kubectl patch daemonset aws-node -n kube-system -p '{\"spec\":{\"template\":{\"spec\":{\"tolerations\":[{\"operator\":\"Exists\"}]}}}}'"
  }

  depends_on = [module.eks]
}



# PassRole policy for Karpenter controller
resource "aws_iam_role_policy" "karpenter_controller_passrole" {
  name = "KarpenterControllerPassRole"
  role = module.karpenter.iam_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = aws_iam_role.karpenter_node_role.arn
      }
    ]
  })

  depends_on = [aws_iam_role.karpenter_node_role]
}

# Karpenter Node IAM Role
resource "aws_iam_role" "karpenter_node_role" {
  name = "KarpenterNodeRole-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "ec2.amazonaws.com"
        },
        Action = "sts:AssumeRole"
      }
    ]
  })
}

# Instance Profile for Karpenter Node Role
resource "aws_iam_instance_profile" "karpenter_node_profile" {
  name = "KarpenterNodeRole-${var.environment}"
  role = aws_iam_role.karpenter_node_role.name
}

# Attach required policies to Karpenter node role
resource "aws_iam_role_policy_attachment" "karpenter_node_policies" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  ])

  role       = aws_iam_role.karpenter_node_role.name
  policy_arn = each.value
}

# EBS CSI Driver IRSA
module "ebs_csi_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "${var.cluster_name}-ebs-csi-driver"

  attach_ebs_csi_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:ebs-csi-controller-sa"]
    }
  }

  tags = {
    Environment = var.environment
    Project     = "shopmate"
  }
}

# EBS CSI Driver Addon
resource "aws_eks_addon" "ebs_csi" {
  cluster_name                = module.eks.cluster_name
  addon_name                  = "aws-ebs-csi-driver"
  addon_version               = "v1.48.0-eksbuild.1"
  service_account_role_arn    = module.ebs_csi_irsa.iam_role_arn
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [module.eks, module.ebs_csi_irsa]
}

# External-DNS IRSA Role
module "external_dns_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "shopmate-eks-external-dns"
  attach_external_dns_policy = true

  oidc_providers = {
    ex = {
      provider_arn = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:external-dns"]
    }
  }
}

# Cert-Manager IRSA Role
module "cert_manager_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "shopmate-eks-cert-manager"
  attach_cert_manager_policy = true

  oidc_providers = {
    ex = {
      provider_arn = module.eks.oidc_provider_arn
      namespace_service_accounts = ["cert-manager:cert-manager"]
    }
  }
}

# Grafana CloudWatch IRSA Role
module "grafana_cloudwatch_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "shopmate-eks-grafana-cloudwatch"

  role_policy_arns = {
    cloudwatch = aws_iam_policy.grafana_cloudwatch_policy.arn
  }

  oidc_providers = {
    ex = {
      provider_arn = module.eks.oidc_provider_arn
      namespace_service_accounts = ["monitoring:shopmate-grafana"]
    }
  }
}

# CloudWatch policy for Grafana
resource "aws_iam_policy" "grafana_cloudwatch_policy" {
  name = "shopmate-eks-grafana-cloudwatch"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:ListMetrics",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:GetMetricData",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:GetLogEvents",
          "logs:StartQuery",
          "logs:StopQuery",
          "logs:GetQueryResults",
          "logs:FilterLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

# DynamoDB Tables (Environment-specific)
resource "aws_dynamodb_table" "products" {
  name           = "shopmate-eks-products-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "N"
  }

  tags = {
    Environment = var.environment
    Project     = "shopmate"
  }
}

resource "aws_dynamodb_table" "carts" {
  name           = "shopmate-eks-carts-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = "shopmate"
  }
}

resource "aws_dynamodb_table" "orders" {
  name           = "shopmate-eks-orders-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = "shopmate"
  }
}

resource "aws_dynamodb_table" "sessions" {
  name           = "shopmate-eks-sessions-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = "shopmate"
  }
}

# External Secrets IRSA Role
module "external_secrets_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "shopmate-eks-external-secrets"

  role_policy_arns = {
    secrets_manager = aws_iam_policy.secrets_manager_access.arn
  }

  oidc_providers = {
    ex = {
      provider_arn = module.eks.oidc_provider_arn
      namespace_service_accounts = ["external-secrets:external-secrets", "shopmate:external-secrets"]
    }
  }

  tags = {
    Environment = var.environment
    Project     = "shopmate"
  }
}

# Secrets Manager Access Policy
resource "aws_iam_policy" "secrets_manager_access" {
  name = "shopmate-eks-secrets-manager-access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:shopmate-eks-*"
      }
    ]
  })
}

# AWS Secrets Manager Secret for Session Secret
resource "aws_secretsmanager_secret" "session_secret" {
  name = "shopmate-eks-session-secret-${var.environment}"
  description = "Session secret for ShopMate EKS application"
  
  force_overwrite_replica_secret = true
  recovery_window_in_days = 0
  
  tags = {
    Environment = var.environment
    Project     = "shopmate"
  }
}

# Session Secret Value
resource "aws_secretsmanager_secret_version" "session_secret" {
  secret_id = aws_secretsmanager_secret.session_secret.id
  secret_string = jsonencode({
    session-secret = "shopmate-${var.environment}-secret-2025-${random_string.session_suffix.result}"
  })
}

# Random suffix for session secret
resource "random_string" "session_suffix" {
  length  = 8
  special = false
  upper   = false
}

# Service Account IRSA Role for DynamoDB Access
module "shopmate_service_account_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "shopmate-eks-service-account"

  role_policy_arns = {
    dynamodb = aws_iam_policy.dynamodb_access.arn
  }

  oidc_providers = {
    ex = {
      provider_arn = module.eks.oidc_provider_arn
      namespace_service_accounts = ["shopmate:shopmate-service-account"]
    }
  }

  depends_on = [
    aws_dynamodb_table.products,
    aws_dynamodb_table.carts,
    aws_dynamodb_table.orders,
    aws_dynamodb_table.sessions,
    aws_iam_policy.dynamodb_access
  ]
}

# DynamoDB Access Policy
resource "aws_iam_policy" "dynamodb_access" {
  name = "shopmate-eks-dynamodb-access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan",
          "dynamodb:Query",
          "dynamodb:DescribeTable"
        ]
        Resource = [
          aws_dynamodb_table.products.arn,
          aws_dynamodb_table.carts.arn,
          aws_dynamodb_table.orders.arn,
          aws_dynamodb_table.sessions.arn
        ]
      }
    ]
  })
}

# Single ECR Repository for all services
resource "aws_ecr_repository" "shopmate" {
  name = "shopmate-eks-${var.environment}"
  
  image_tag_mutability = "MUTABLE"
  force_delete = true
  
  image_scanning_configuration {
    scan_on_push = false
  }
  
  tags = {
    Name        = "shopmate-eks-${var.environment}"
    Environment = var.environment
  }
}

# Future Enhancement: AWS Load Balancer Controller
# 
# Alternative to NGINX Ingress with advanced AWS features:
# - Application Load Balancer (ALB) instead of Network Load Balancer (NLB)
# - Advanced routing rules and path-based routing
# - AWS WAF integration for security
# - Cognito/OIDC authentication
# - Blue/green deployments
# - Target group health checks
# 
# To implement:
# 1. Add IRSA role: attach_load_balancer_controller_policy = true
# 2. Install controller: helm install aws-load-balancer-controller
# 3. Use ingress.class: alb instead of nginx
# 4. Add ALB-specific annotations for advanced features