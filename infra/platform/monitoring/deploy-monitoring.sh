#!/bin/bash

set -e

echo "📊 Deploying Shopmate Monitoring Stack..."

# Add Helm repositories
echo "📦 Adding monitoring repositories..."
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Create monitoring namespace
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Install standalone Loki for Logging
echo "📊 Installing Loki for Logging..."
helm upgrade --install shopmate-loki grafana/loki \
  --namespace monitoring \
  --values platform/monitoring/loki-simple-values.yaml

# Install Promtail for Log Collection
echo "📊 Installing Promtail for Log Collection..."
helm upgrade --install shopmate-promtail grafana/promtail \
  --namespace monitoring \
  --values platform/monitoring/promtail-values.yaml

# Install regular Prometheus with environment-specific values
echo "📈 Installing Prometheus Stack..."
if [ "${ENVIRONMENT:-dev}" = "prod" ]; then
    PROMETHEUS_VALUES="prometheus-values-letsencrypt.yaml"
else
    PROMETHEUS_VALUES="prometheus-values-selfsigned.yaml"
fi

helm upgrade --install shopmate-prometheus prometheus-community/prometheus \
  --namespace monitoring \
  --values platform/monitoring/$PROMETHEUS_VALUES

# Install Grafana with environment-specific values
echo "📊 Installing Grafana..."
if [ "${ENVIRONMENT:-dev}" = "prod" ]; then
    GRAFANA_VALUES="grafana-values-prod.yaml"
else
    GRAFANA_VALUES="grafana-values-dev.yaml"
fi

helm upgrade --install shopmate-grafana grafana/grafana \
  --namespace monitoring \
  --values platform/monitoring/$GRAFANA_VALUES

echo "⏳ Monitoring components deploying in background..."
echo "ℹ️ Skipping wait - monitoring will be ready shortly"

# Monitoring ingress is now deployed via Kustomize
echo "🌐 Monitoring ingress will be deployed via Kustomize..."

echo "✅ Monitoring stack deployed successfully!"
echo ""
echo "🔗 Access URLs (after ingress setup):"
if [ "${ENVIRONMENT:-dev}" = "prod" ]; then
    BASE_URL="https://shopmate-eks.sctp-sandbox.com"
else
    BASE_URL="https://shopmate-eks.dev.sctp-sandbox.com"
fi
echo "  Prometheus: $BASE_URL/prometheus"
echo "  Grafana: $BASE_URL/grafana (admin/admin)"
echo "  AlertManager: $BASE_URL/alertmanager"