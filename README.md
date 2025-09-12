# ShopMate EKS Microservices Platform

> **Enterprise-grade microservices platform on Amazon EKS with comprehensive monitoring, auto-scaling, and GitOps capabilities**

[![AWS](https://img.shields.io/badge/AWS-EKS-orange)](https://aws.amazon.com/eks/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-1.28+-blue)](https://kubernetes.io/)
[![Terraform](https://img.shields.io/badge/Terraform-1.5+-purple)](https://terraform.io/)
[![Monitoring](https://img.shields.io/badge/Monitoring-Prometheus%2BGrafana-green)](https://prometheus.io/)

## 🏗️ EKS Infrastructure Implementation

### Amazon EKS Cluster Configuration

**Cluster Specifications:**
- **Kubernetes Version**: 1.28+
- **Control Plane**: Fully managed by AWS
- **Node Groups**: Karpenter-managed for intelligent scaling
- **Instance Types**: t3.medium (optimized for cost and performance)
- **Networking**: AWS VPC CNI with custom VPC
- **Subnets**: Private subnets for worker nodes, public for load balancers

**Security Implementation:**
- **IRSA (IAM Roles for Service Accounts)**: Fine-grained permissions
- **Private Subnets**: Worker nodes isolated from internet
- **Security Groups**: Restrictive ingress/egress rules
- **External Secrets Controller**: Secure secret management from AWS Secrets Manager
- **SSL/TLS**: End-to-end encryption with cert-manager

### Karpenter Auto-Scaling

**Node Provisioning:**
- **Intelligent Scaling**: Automatic node provisioning based on pod requirements
- **Cost Optimization**: Right-sizing instances for workload demands
- **Multi-AZ**: Nodes distributed across availability zones
- **Spot Instances**: Cost-effective scaling with spot instance support
- **Scale-down**: 60-second graceful node termination
- **Scale-up**: 30-second rapid node provisioning

**Resource Management:**
```yaml
# Karpenter NodePool Configuration
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]
        - key: node.kubernetes.io/instance-type
          operator: In
          values: ["t3.medium", "t3.large"]
      nodeClassRef:
        apiVersion: karpenter.k8s.aws/v1beta1
        kind: EC2NodeClass
        name: default
  limits:
    cpu: 1000
    memory: 1000Gi
  disruption:
    consolidationPolicy: WhenUnderutilized
    consolidateAfter: 30s
```

### Platform Services on EKS

**NGINX Ingress Controller:**
- **Load Balancing**: Layer 7 application load balancing
- **SSL Termination**: Automated certificate management
- **Path-based Routing**: Route traffic to microservices
- **Health Checks**: Readiness and liveness probes

**Cert-Manager:**
- **Let's Encrypt Integration**: Automated SSL certificate provisioning
- **Certificate Renewal**: Automatic certificate rotation
- **DNS Challenge**: Route53 DNS validation
- **Multi-domain Support**: Wildcard and SAN certificates

**External Secrets Controller:**
- **AWS Secrets Manager Integration**: Secure secret retrieval
- **Automatic Rotation**: Secret updates without pod restarts
- **IRSA Authentication**: IAM-based access control
- **Multi-environment**: Separate secrets per environment

**External-DNS:**
- **Route53 Integration**: Automated DNS record management
- **Service Discovery**: Automatic DNS updates for services
- **Multi-zone Support**: Cross-AZ DNS resolution

### Monitoring Stack Implementation

**Prometheus on EKS:**
- **Metrics Collection**: Custom metrics from all microservices
- **Service Discovery**: Automatic pod and service discovery
- **Persistent Storage**: EBS volumes for metric retention
- **High Availability**: Multi-replica deployment

**Grafana Dashboards:**
- **EKS Cluster Metrics**: Node utilization, pod status
- **Application Metrics**: Request rates, response times
- **Karpenter Metrics**: Node scaling events, cost optimization
- **Custom Alerts**: Proactive monitoring with PagerDuty integration

**Loki Log Aggregation:**
- **Structured Logging**: JSON-formatted logs from all services
- **Log Retention**: 30-day retention with S3 archival
- **Query Performance**: Optimized for high-volume log search

### Horizontal Pod Autoscaler (HPA)

**CPU-based Scaling:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: microservices-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: product-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

## 📁 Project Structure

```
shopmate-eks-microservices/
├── infra/terraform/                 # EKS Infrastructure
│   ├── vpc.tf                      # VPC, subnets, security groups
│   ├── eks.tf                      # EKS cluster configuration
│   ├── karpenter.tf                # Karpenter setup
│   ├── dynamodb.tf                 # DynamoDB tables
│   └── iam.tf                      # IRSA roles and policies
├── infra/platform/
│   ├── controllers/                # Platform controllers
│   │   ├── nginx-ingress.yaml      # NGINX Ingress Controller
│   │   ├── cert-manager.yaml       # Certificate management
│   │   ├── external-secrets.yaml   # External Secrets Controller
│   │   └── external-dns.yaml       # DNS automation
│   └── monitoring/                 # Observability stack
│       ├── prometheus.yaml         # Metrics collection
│       ├── grafana.yaml           # Visualization
│       └── loki.yaml              # Log aggregation
├── k8s/                           # Kustomize manifests
│   ├── base/                      # Base configurations
│   └── overlays/                  # Environment overlays
│       ├── dev/                   # Development
│       └── prod/                  # Production
└── microservices/                 # Application code
    ├── product-service/
    ├── cart-service/
    ├── order-service/
    └── frontend-service/
```

## 🎯 Microservices on EKS

| Service | Port | EKS Resources | Scaling |
|---------|------|---------------|----------|
| **Frontend** | 3000 | 2-8 replicas, 256Mi RAM | HPA + Karpenter |
| **Product** | 3001 | 2-10 replicas, 512Mi RAM | HPA + Karpenter |
| **Cart** | 3002 | 2-6 replicas, 256Mi RAM | HPA + Karpenter |
| **Order** | 3003 | 2-8 replicas, 512Mi RAM | HPA + Karpenter |

### EKS Deployment Strategy

**Rolling Updates:**
- **Zero-downtime deployments** with rolling update strategy
- **Health checks** ensure pods are ready before traffic routing
- **Rollback capability** for failed deployments
- **Blue-green deployments** for critical updates

**Resource Allocation:**
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

**Pod Disruption Budgets:**
```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: microservices-pdb
spec:
  minAvailable: 50%
  selector:
    matchLabels:
      app: shopmate-microservice
```

### AWS Integration

**DynamoDB Integration:**
- **IRSA-based access** to DynamoDB tables
- **VPC Endpoints** for private connectivity
- **Auto-scaling** based on read/write capacity
- **Point-in-time recovery** enabled

**ECR Integration:**
- **Private container registry** for microservice images
- **Image scanning** for security vulnerabilities
- **Lifecycle policies** for image cleanup
- **Cross-region replication** for disaster recovery

**Route53 Integration:**
- **Automated DNS management** via External-DNS
- **Health checks** for service endpoints
- **Failover routing** for high availability
- **Weighted routing** for canary deployments

### Kustomize Configuration Management

**Base + Overlays Pattern:**
- **42% File Reduction**: From 19 to 11 files through consolidation
- **DRY Principle**: No configuration duplication between environments
- **Environment Isolation**: Clean separation of dev/prod configurations
- **Maintainability**: Single source of truth for common configurations

**Environment-Specific Configurations:**
- **Development**: Lower resource limits, debug logging
- **Production**: Higher resource limits, optimized performance
- **SSL Certificates**: Let's Encrypt for dev, commercial certs for prod
- **Domain Names**: Environment-specific subdomains

### Service Mesh and Networking

**VPC Configuration:**
- **Private Subnets**: Worker nodes in private subnets
- **Public Subnets**: Load balancers and NAT gateways
- **Multi-AZ**: High availability across availability zones
- **Security Groups**: Restrictive network policies

**Ingress Configuration:**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shopmate-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - shopmate-eks.sctp-sandbox.com
    secretName: shopmate-tls
  rules:
  - host: shopmate-eks.sctp-sandbox.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-service
            port:
              number: 3000
      - path: /api/products
        pathType: Prefix
        backend:
          service:
            name: product-service
            port:
              number: 3001
```

## 🚀 EKS Deployment

### Prerequisites
- **AWS CLI** configured with EKS permissions
- **kubectl** for Kubernetes management
- **Helm** for package management
- **Terraform** for infrastructure provisioning
- **eksctl** for EKS cluster management

### Infrastructure Deployment

```bash
# Deploy EKS infrastructure
cd infra/terraform
terraform init
terraform plan -var="region=ap-southeast-1"
terraform apply

# Configure kubectl
aws eks update-kubeconfig --region ap-southeast-1 --name shopmate-eks

# Deploy platform services
kubectl apply -f ../platform/controllers/
kubectl apply -f ../platform/monitoring/

# Deploy applications
kubectl apply -k ../../k8s/overlays/prod
```

### EKS Cluster Components

**Infrastructure (Terraform):**
- **EKS Cluster**: Managed Kubernetes control plane
- **VPC**: Custom VPC with public/private subnets
- **Security Groups**: Restrictive network policies
- **IAM Roles**: IRSA for service accounts
- **Karpenter**: Node auto-scaling controller

**Platform Services (Helm/YAML):**
- **NGINX Ingress**: Application load balancing
- **Cert-Manager**: SSL certificate automation
- **External Secrets**: AWS Secrets Manager integration
- **External-DNS**: Route53 DNS automation
- **Metrics Server**: HPA metrics collection

**Monitoring Stack:**
- **Prometheus**: Metrics collection and alerting
- **Grafana**: Visualization and dashboards
- **Loki**: Log aggregation and search
- **Promtail**: Log collection agent

## 🌐 EKS Service Access

### Production Environment
- **Application**: https://shopmate-eks.sctp-sandbox.com
- **Prometheus**: https://shopmate-eks.sctp-sandbox.com/prometheus
- **Grafana**: https://shopmate-eks.sctp-sandbox.com/grafana

### Development Environment
- **Application**: https://shopmate-eks.dev.sctp-sandbox.com
- **Prometheus**: https://shopmate-eks.dev.sctp-sandbox.com/prometheus
- **Grafana**: https://shopmate-eks.dev.sctp-sandbox.com/grafana

### EKS Cluster Management

```bash
# Check cluster status
kubectl get nodes
kubectl get pods -A

# View Karpenter nodes
kubectl get nodes -l karpenter.sh/provisioner-name

# Monitor HPA scaling
kubectl get hpa -n shopmate

# Check ingress status
kubectl get ingress -n shopmate
```

## 📊 API Documentation

### Product Service API (Port 3001)
```http
GET    /api/products           # List all products
GET    /api/products/:id       # Get product details
PUT    /api/products/:id/stock # Update inventory
GET    /health                 # Health check
GET    /metrics               # Prometheus metrics
```

**Example Request/Response:**
```bash
# Get all products
curl https://shopmate-eks.sctp-sandbox.com/api/products

# Response
[
  {
    "id": 1,
    "name": "Smartphone X12 Pro",
    "price": 699.99,
    "description": "Latest flagship smartphone",
    "stock": 50,
    "image": "/images/smartphone.jpg"
  }
]
```

### Cart Service API (Port 3002)
```http
GET    /api/cart/:userId       # Get user's cart
POST   /api/cart/:userId/add   # Add item to cart
PUT    /api/cart/:userId       # Update cart items
DELETE /api/cart/:userId       # Clear cart
GET    /health                 # Health check
GET    /metrics               # Prometheus metrics
```

**Example Request/Response:**
```bash
# Add item to cart
curl -X POST https://shopmate-eks.sctp-sandbox.com/api/cart/user123/add \
  -H "Content-Type: application/json" \
  -d '{"productId": 1, "quantity": 2}'

# Response
{
  "success": true,
  "cart": [
    {"productId": 1, "quantity": 2}
  ]
}
```

### Order Service API (Port 3003)
```http
POST   /api/orders             # Create new order
GET    /api/orders/:id         # Get order details
GET    /api/orders/user/:userId # Get user's orders
GET    /health                 # Health check
GET    /metrics               # Prometheus metrics
```

**Example Request/Response:**
```bash
# Create order
curl -X POST https://shopmate-eks.sctp-sandbox.com/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "customer": {
      "name": "John Doe",
      "email": "john@example.com",
      "address": "123 Main St"
    }
  }'

# Response
{
  "id": "order-uuid-123",
  "userId": "user123",
  "status": "Confirmed",
  "total": 1399.98,
  "items": [...],
  "date": "2025-01-11T10:30:00Z"
}
```

### Frontend Service (Port 3000)
- **Web Interface**: Complete e-commerce UI at `/`
- **Health Check**: `/health`
- **Metrics**: `/metrics`
- **Routes**: `/products`, `/cart`, `/orders`, `/checkout`

**Key Frontend Features:**
- 🏠 **Home Page**: Product showcase and navigation
- 🛍️ **Product Catalog**: Browse and search products
- 🛒 **Shopping Cart**: Add, update, remove items
- 💳 **Checkout**: Customer information and order placement
- 📄 **Order History**: View past orders and status



## 🎯 EKS Platform Features

### EKS-Specific Capabilities
- ✅ **Managed Control Plane**: AWS-managed Kubernetes API server
- ✅ **Karpenter Auto-Scaling**: Intelligent node provisioning and cost optimization
- ✅ **IRSA Security**: Fine-grained IAM permissions for pods
- ✅ **VPC CNI**: Native AWS networking with security groups
- ✅ **EBS CSI**: Persistent storage for stateful workloads
- ✅ **AWS Load Balancer Controller**: Native AWS load balancer integration

### Operational Excellence on EKS
- 🔄 **Rolling Updates**: Zero-downtime deployments with health checks
- 📊 **CloudWatch Integration**: Native AWS monitoring and logging
- 🚨 **Multi-layered Monitoring**: Prometheus + CloudWatch + X-Ray
- 📝 **Structured Logging**: JSON logs with CloudWatch Logs integration
- 🔍 **Distributed Tracing**: AWS X-Ray for request tracing
- 🛡️ **Security Scanning**: ECR image scanning + Falco runtime security

### EKS Cost Optimization
- 💰 **Spot Instances**: Karpenter spot instance integration
- 📈 **Right-sizing**: Automatic instance type selection
- 🎛️ **Resource Efficiency**: HPA + VPA for optimal resource usage
- 📊 **Cost Monitoring**: AWS Cost Explorer integration
- ⚡ **Fast Scaling**: 30-second node provisioning

### EKS Developer Experience
- 🚀 **Infrastructure as Code**: Terraform + Kustomize
- 🔧 **GitOps Workflow**: ArgoCD-ready configurations
- 📈 **Load Testing**: K6 + Grafana dashboards
- 🎛️ **Multi-environment**: Dev/staging/prod isolation
- 📚 **Observability**: Comprehensive metrics and logs



## 🔧 EKS Management Commands

```bash
# EKS cluster operations
aws eks describe-cluster --name shopmate-eks
aws eks update-kubeconfig --name shopmate-eks

# Karpenter node management
kubectl get nodes -l karpenter.sh/provisioner-name
kubectl describe node <node-name>

# Application deployment
kubectl apply -k k8s/overlays/prod
kubectl get pods -n shopmate
kubectl logs -f deployment/product-service -n shopmate

# HPA monitoring
kubectl get hpa -n shopmate
kubectl describe hpa product-service-hpa -n shopmate

# Ingress and networking
kubectl get ingress -n shopmate
kubectl get svc -n shopmate
```

---

**Built with ❤️ for enterprise-grade microservices on AWS EKS**