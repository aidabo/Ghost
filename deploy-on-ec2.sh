#!/bin/bash
#
# deploy-on-ec2.sh — backend (ghost) deploy on the EC2 host.
#
#   Version : env VERSION > 1st arg > SSM parameter > deploy.version
#   Tenant  : TENANT=<tenant>; used for the SSM parameter default and logs.
#             The image is shared by tenants.
#   Image   : s3://60-legacy/deploy-image/ghost-<VERSION>.tar.gz
#   Compose : exports GHOST_IMAGE_TAG; restarts only the `ghost` service.
#   Log     : /var/log/ghost-deploy/backend-<timestamp>.log
#
# This script is installed on the target by scripts/deploy-backend.mjs.
set -o pipefail

S3_BUCKET="${S3_BUCKET:-60-legacy}"
S3_FOLDER="${S3_FOLDER:-deploy-image}"
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
IMAGE_NAME="ghost"
SERVICE_NAME="${SERVICE_NAME:-ghost}"
TENANT="${TENANT:-60-think}"
case "$TENANT" in
  ""|*[!a-z0-9-]*)
    echo "[ERROR] invalid tenant: $TENANT (lowercase letters, digits, hyphens)" >&2
    exit 1
    ;;
esac
ARTIFACT_NAME="${ARTIFACT_NAME:-$IMAGE_NAME}"
SSM_PARAM="${SSM_PARAM:-/$TENANT/prd/deploy/backend/version}"
DIR="$(cd "$(dirname "$0")" && pwd)"

# --- version resolution -------------------------------------------------------
if [ -z "${VERSION:-}" ] && [ -n "${1:-}" ]; then
  VERSION="$1"
fi
if [ -z "${VERSION:-}" ] && [ -n "$SSM_PARAM" ] && command -v aws >/dev/null 2>&1; then
  VERSION="$(aws ssm get-parameter --region "$AWS_REGION" --name "$SSM_PARAM" \
    --query Parameter.Value --output text 2>/dev/null || true)"
  if [ -n "${VERSION:-}" ]; then
    echo "[INFO] VERSION from SSM $SSM_PARAM: $VERSION"
  fi
fi
if [ -z "${VERSION:-}" ]; then
  for vf in "$DIR/deploy.version" "$PWD/deploy.version"; do
    [ -f "$vf" ] || continue
    VERSION="$(grep -vE '^[[:space:]]*(#|$)' "$vf" | head -n1)"
    VERSION="${VERSION#VERSION=}"
    VERSION="${VERSION#\"}"; VERSION="${VERSION%\"}"
    VERSION="${VERSION#\'}"; VERSION="${VERSION%\'}"
    [ -n "$VERSION" ] && break
  done
fi
if [ -z "${VERSION:-}" ]; then
  echo "[ERROR] VERSION not set. Pass it: ./deploy-on-ec2.sh <VERSION>" >&2
  echo "        (or set $SSM_PARAM / place deploy.version next to this script)" >&2
  exit 1
fi
# The tag goes into an S3 key and a Docker tag; refuse anything outside a
# conservative tag alphabet.
case "$VERSION" in
  ""|*[!A-Za-z0-9._-]*|[.-]*|*[.-])
    echo "[ERROR] invalid VERSION: $VERSION" >&2
    exit 1
    ;;
esac

# --- logging -----------------------------------------------------------------
LOG_DIR="${LOG_DIR:-/var/log/ghost-deploy}"
if ! mkdir -p "$LOG_DIR" 2>/dev/null; then
  LOG_DIR="$DIR/logs"
  mkdir -p "$LOG_DIR"
fi
LOG="$LOG_DIR/backend-$(date +%Y%m%dT%H%M%S%z).log"
exec > >(tee -a "$LOG") 2>&1
echo "[INFO] deploy start tenant=$TENANT version=$VERSION dir=$DIR log=$LOG"

# --- backend compose env ------------------------------------------------------
# The backend compose file interpolates ${GHOST_MYSQL_*} / ${GHOST_S3_*} /
# ${GHOST_HOST_PORT} and has no .env file. Do NOT source the file: it lives in
# the deploy user's workdir and this script runs as root. Parse key=value lines
# into a root-only file and let compose read it.
COMPOSE=(docker compose)
ENV_FILE="${DEPLOY_ENV_FILE:-}"
if [ -z "$ENV_FILE" ]; then
  for candidate in "$DIR/env.prd.sh" "$DIR/env-prd.sh" "$PWD/env.prd.sh" "$PWD/env-prd.sh"; do
    if [ -f "$candidate" ]; then ENV_FILE="$candidate"; break; fi
  done
fi
if [ -n "$ENV_FILE" ] && [ ! -f "$ENV_FILE" ]; then
  echo "[FATAL] DEPLOY_ENV_FILE not found: $ENV_FILE" >&2
  exit 1
fi
if [ -z "$ENV_FILE" ] && [ "${ALLOW_NO_ENV_FILE:-0}" != "1" ]; then
  echo "[FATAL] no compose env file (env.prd.sh / env-prd.sh in $DIR or $PWD). Set DEPLOY_ENV_FILE, or ALLOW_NO_ENV_FILE=1 if the compose file needs none" >&2
  exit 1
fi
if [ -n "$ENV_FILE" ]; then
  SAFE_ENV="$(mktemp)"
  chmod 600 "$SAFE_ENV"
  grep -vE '^[[:space:]]*(export[[:space:]]+)?GHOST_IMAGE_TAG=' "$ENV_FILE" \
    | grep -E '^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' \
    | sed -E 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*/\2=/' \
    > "$SAFE_ENV" || true
  echo "GHOST_IMAGE_TAG=$VERSION" >> "$SAFE_ENV"
  COMPOSE=(docker compose --env-file "$SAFE_ENV")
  trap 'rm -f "$SAFE_ENV"' EXIT
  echo "[INFO] using compose env file: $ENV_FILE (sanitized)"
fi

export GHOST_IMAGE_TAG="$VERSION"

# --- download the image --------------------------------------------------------
# Always load from S3 by default: a tag can be rebuilt and re-uploaded with
# VERSION=..., and a stale local image with the same tag would pass the tag check.
if [ "${SKIP_PULL_IF_PRESENT:-0}" = "1" ] && docker image inspect "$IMAGE_NAME:$VERSION" >/dev/null 2>&1; then
  echo "[INFO] image already present: $IMAGE_NAME:$VERSION (skip download because SKIP_PULL_IF_PRESENT=1)"
else
  GZ="$ARTIFACT_NAME-$VERSION.tar.gz"
  TAR="$ARTIFACT_NAME-$VERSION.tar"
  ARCHIVE=""
  if aws s3 cp "s3://$S3_BUCKET/$S3_FOLDER/$GZ" "$GZ" --region "$AWS_REGION"; then
    ARCHIVE="$GZ"
  else
    echo "[INFO] $GZ not found in S3 — falling back to $TAR"
    if ! aws s3 cp "s3://$S3_BUCKET/$S3_FOLDER/$TAR" "$TAR" --region "$AWS_REGION"; then
      echo "[FATAL] image archive not found in S3: $GZ / $TAR (nothing restarted)" >&2
      exit 1
    fi
    ARCHIVE="$TAR"
  fi
  # A failed load must stop here: a stale local image with the same tag would
  # otherwise be restarted and pass the tag check.
  if ! docker load -i "$ARCHIVE"; then
    rm -f "$ARCHIVE"
    echo "[FATAL] docker load failed: $ARCHIVE (nothing restarted)" >&2
    exit 1
  fi
  rm -f "$ARCHIVE"
fi

# --- restart only the ghost service -------------------------------------------
"${COMPOSE[@]}" stop "$SERVICE_NAME" || true
"${COMPOSE[@]}" rm -f "$SERVICE_NAME" || true
"${COMPOSE[@]}" up -d "$SERVICE_NAME"

# --- verify the running image tag ---------------------------------------------
echo "=== verify image tag ==="
CID="$("${COMPOSE[@]}" ps -q "$SERVICE_NAME" 2>/dev/null || true)"
if [ -z "$CID" ]; then
  echo "[FATAL] no running container for service: $SERVICE_NAME" >&2
  exit 1
fi
IMG="$(docker inspect -f '{{.Config.Image}}' "$CID" 2>/dev/null || true)"
echo "[INFO] $SERVICE_NAME -> ${IMG:-<unknown>}"
case "$IMG" in
  "$IMAGE_NAME:$VERSION") ;;
  *) echo "[FATAL] $SERVICE_NAME is not running $IMAGE_NAME:$VERSION" >&2; exit 1 ;;
esac

# --- mandatory post-deploy log ------------------------------------------------
echo "=== docker compose ps ==="
"${COMPOSE[@]}" ps "$SERVICE_NAME" || true
sleep 3
echo "=== recent container logs (tail 100) ==="
"${COMPOSE[@]}" logs --tail=100 --no-color "$SERVICE_NAME" || true

docker images | grep "<none>" | awk '{print $3}' | xargs -r docker rmi --force || true

echo "[OK] deploy complete version=$VERSION log=$LOG"
