# Cluster Information
output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_oidc_provider_arn" {
  description = "EKS cluster OIDC provider ARN"
  value       = module.eks.oidc_provider_arn
}

# IRSA Role ARNs for Helm deployments

output "external_dns_irsa_arn" {
  description = "External-DNS IRSA role ARN"
  value       = module.external_dns_irsa.iam_role_arn
}

output "cert_manager_irsa_arn" {
  description = "Cert-Manager IRSA role ARN"
  value       = module.cert_manager_irsa.iam_role_arn
}

output "service_account_irsa_arn" {
  description = "Shopmate service account IRSA role ARN"
  value       = module.shopmate_service_account_irsa.iam_role_arn
}

output "ebs_csi_irsa_arn" {
  description = "EBS CSI driver IRSA role ARN"
  value       = module.ebs_csi_irsa.iam_role_arn
}

output "external_secrets_irsa_arn" {
  description = "External Secrets IRSA role ARN"
  value       = module.external_secrets_irsa.iam_role_arn
}

# Future: AWS Load Balancer Controller IRSA ARN
# output "aws_load_balancer_controller_irsa_arn" {
#   description = "AWS Load Balancer Controller IRSA role ARN"
#   value       = module.aws_load_balancer_controller_irsa.iam_role_arn
# }

# Karpenter IRSA Role ARN
output "karpenter_irsa_arn" {
  description = "Karpenter IRSA role ARN"
  value       = module.karpenter.iam_role_arn
}

output "karpenter_node_role_arn" {
  description = "Karpenter node role ARN"
  value       = aws_iam_role.karpenter_node_role.arn
}

# ECR Repository
output "ecr_repository_url" {
  description = "ECR repository URL for all services"
  value       = aws_ecr_repository.shopmate.repository_url
}