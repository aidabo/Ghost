#!/bin/bash

# Configuration
S3_BUCKET="60-legacy"
S3_FOLDER="deploy-image"
AWS_REGION="ap-northeast-1"
IMAGE_NAME="ghost"
VERSION="5.116.2-next-r260817"

# yarn docker:build
yarn docker:next:build

# Docker Hub への tag / push は行わない（2026-09-11 決定: 配布は S3 経由のみ）。
# ローカルの $IMAGE_NAME:$VERSION をそのまま .tar にして下の S3 へ上げ、
# 受け側の deploy-on-ec2.sh が同じキーを docker load する。

# Save image as .tar
docker save -o $IMAGE_NAME-$VERSION.tar $IMAGE_NAME:$VERSION

# Upload to S3
aws s3 cp $IMAGE_NAME-$VERSION.tar s3://$S3_BUCKET/$S3_FOLDER/$IMAGE_NAME-$VERSION.tar --region $AWS_REGION

# Cleanup local file
rm $IMAGE_NAME-$VERSION.tar

echo "Upload completed: s3://$S3_BUCKET/$S3_FOLDER/$IMAGE_NAME-$VERSION.tar"

# Clean docker build cache
docker builder prune --force

# Cleanup all
# docker system prune -a
