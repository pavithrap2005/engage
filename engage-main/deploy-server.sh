#!/bin/bash
# Indiquer Engage Server Deployment Script for indicar-engage on 100.123.62.66
set -e

echo "🚀 Starting Indiquer Engage Deployment..."

# 1. Ensure Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker indiquergrc
fi

if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    sudo apt-get update && sudo apt-get install -y docker-compose
fi

# 2. Build and start containers
echo "🐳 Building Docker containers..."
docker-compose up -d --build

echo "✅ Docker containers running!"
docker-compose ps

echo "🎉 Deployment complete! Server listening on port 3001"
