#!/bin/bash

# Configuration
S3_BUCKET="60-legacy"
S3_FOLDER="deploy-image"
AWS_REGION="ap-northeast-1"
IMAGE_NAME="ghost"
VERSION="5.116.2-alpine-next-alpha1"

# Download from S3
aws s3 cp s3://$S3_BUCKET/$S3_FOLDER/$IMAGE_NAME-$VERSION.tar . --region $AWS_REGION

# down service
docker compose down

# remove old image and container
docker rmi $IMAGE_NAME:$VERSION --force 

# Load Docker image
docker load -i $IMAGE_NAME-$VERSION.tar

# Run new container
docker compose up -d 

# Cleanup
rm $IMAGE_NAME-$VERSION.tar

# Clean old image and and container
docker images | grep "<none>" | awk '{print $3}' | xargs docker rmi --force

# Confirm images
docker images

# Confirm containers
docker compose ps

echo "Deployment completed!"