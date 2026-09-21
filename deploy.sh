#!/bin/bash
#
# deploy.sh — build the Ghost Docker image and upload to S3 as gzip (.tar.gz).
#
#   Version : read from package.json "deployVersion" (bump there only).
#             Override for a one-off run with:  VERSION=... ./deploy.sh
#   Build   : runs `yarn docker:next:build`, then streams `docker save | gzip` to S3.
#   Output  : s3://$S3_BUCKET/$S3_FOLDER/ghost-<VERSION>.tar.gz
#   Pair    : deploy-on-ec2.sh downloads that key and `docker load`s it on the host.
#   Note    : distribution is S3-only (no Docker Hub push) — decided 2026-09-11.
#
# Fail the whole pipeline if any stage fails (e.g. `docker save`), so a broken
# image is never silently uploaded as a truncated archive.
set -o pipefail

# Configuration
S3_BUCKET="60-legacy"
S3_FOLDER="deploy-image"
AWS_REGION="ap-northeast-1"
IMAGE_NAME="ghost"
# Release version — single source of truth is package.json "deployVersion".
# Bump it there only. An explicit VERSION=... in the environment overrides it.
# (node is available on the build host, so reading package.json is fine here.)
_SD="$(cd "$(dirname "$0")" && pwd)"
if [ -z "${VERSION:-}" ]; then
  VERSION="$(node -p "require('$_SD/package.json').deployVersion")"
fi
if [ -z "${VERSION:-}" ] || [ "$VERSION" = "undefined" ]; then
  echo "[ERROR] VERSION not resolved (set env VERSION or package.json deployVersion)"
  exit 1
fi

# yarn docker:build
yarn docker:next:build

# Docker Hub への tag / push は行わない（2026-09-11 決定: 配布は S3 経由のみ）。
# ローカルの $IMAGE_NAME:$VERSION を gzip 圧縮した .tar.gz にして S3 へ上げ、
# 受け側の deploy-on-ec2.sh が同じキーを docker load する（docker が自動解凍）。

# Save image as gzip-compressed .tar.gz and stream straight to S3 (no local file)
GZ_KEY="s3://$S3_BUCKET/$S3_FOLDER/$IMAGE_NAME-$VERSION.tar.gz"
docker save "$IMAGE_NAME:$VERSION" | gzip | aws s3 cp - "$GZ_KEY" --region $AWS_REGION
rc=$?
if [ $rc -ne 0 ]; then
  echo "[ERROR] Upload failed for $IMAGE_NAME:$VERSION (exit $rc)"
  exit $rc
fi

echo "Upload completed: $GZ_KEY"

# Clean docker build cache
docker builder prune --force

# Cleanup all
# docker system prune -a
