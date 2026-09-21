#!/bin/bash
#
# deploy-on-ec2.sh — PRODUCTION deploy of Ghost on the EC2 host (no repo there).
#   Downloads the image from S3, `docker load`s it, and restarts compose.
#   `docker load` auto-detects gzip, so .tar.gz and legacy .tar both work;
#   download prefers .tar.gz and falls back to .tar.
#
#   Version : pass it explicitly (the host has no package.json) —
#               ./deploy-on-ec2.sh 5.116.2-next-r260921
#             Resolution order: env VERSION > 1st CLI arg > co-located deploy.version.
#   Pair    : deploy.sh (build host) produces the S3 key this reads.
#
# Configuration
S3_BUCKET="60-legacy"
S3_FOLDER="deploy-image"
AWS_REGION="ap-northeast-1"
IMAGE_NAME="ghost"
# Release version. Resolution order: env VERSION > first CLI arg > co-located
# deploy.version (only present when copied next to this script). On an EC2 host
# without the repo, pass it explicitly:  ./deploy-on-ec2.sh <VERSION>
if [ -z "${VERSION:-}" ] && [ -n "${1:-}" ]; then
  VERSION="$1"
fi
if [ -z "${VERSION:-}" ]; then
  _VF="$(cd "$(dirname "$0")" && pwd)/deploy.version"
  if [ -f "$_VF" ]; then
    . "$_VF"
  else
    echo "[ERROR] VERSION not set. Pass it: ./deploy-on-ec2.sh <VERSION>"
    echo "        (or place deploy.version next to this script)"
    exit 1
  fi
fi

# Download from S3 (.tar.gz preferred, legacy .tar fallback)
GZ_FILE="$IMAGE_NAME-$VERSION.tar.gz"
TAR_FILE="$IMAGE_NAME-$VERSION.tar"
if aws s3 cp "s3://$S3_BUCKET/$S3_FOLDER/$GZ_FILE" "$GZ_FILE" --region $AWS_REGION; then
  ARCHIVE="$GZ_FILE"
else
  echo "[INFO] $GZ_FILE not found in S3 — falling back to $TAR_FILE"
  aws s3 cp "s3://$S3_BUCKET/$S3_FOLDER/$TAR_FILE" "$TAR_FILE" --region $AWS_REGION
  ARCHIVE="$TAR_FILE"
fi

# down service
docker compose down

# remove old image and container
docker rmi $IMAGE_NAME:$VERSION --force

# Load Docker image (`docker load` auto-detects gzip, so .tar and .tar.gz both work)
docker load -i "$ARCHIVE"

# Run new container
docker compose up -d

# Cleanup
rm -f "$ARCHIVE"

# Clean old image and and container
docker images | grep "<none>" | awk '{print $3}' | xargs docker rmi --force

# Confirm images
docker images

# Confirm containers
docker compose ps

echo "Deployment completed!"
