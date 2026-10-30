#!/bin/bash
#
# deploy.sh — build the Ghost Docker image and upload to S3 as gzip (.tar.gz).
#
#   Version : read from package.json "deployVersion" (bump there only).
#             Override for a one-off run with:  VERSION=... ./deploy.sh
#   Build   : runs `yarn docker:next:build`, then streams `docker save | gzip` to S3.
#   Output  : s3://$S3_BUCKET/$S3_FOLDER/ghost-<VERSION>.tar.gz
#             (the image is shared by tenants; the compose file uses
#              ghost:${GHOST_IMAGE_TAG})
#   Tenant  : TENANTS="60-think thinkestate" (default: keys in deploy-targets.json)
#             or TENANT=<one|all>. Selects which tenants' SSM parameters are
#             updated; the image name does not change per tenant.
#   Pair    : scripts/deploy-backend.mjs installs this repo's
#             deploy-on-ec2.sh on the target and loads the tenant's key.
#   AWS     : uploads with profile DEPLOY_AWS_PROFILE (default 60-think), checked first.
#   SSM     : after a successful upload, writes the selected tenants' version to
#             /60-think/prd/deploy/backend/version and /thinkestate/...
#             ssmParam in deploy-targets.json (selected TENANTS only); WRITE_SSM_PARAM=0 skips.
#   Env     : DEPLOY_AWS_ACCOUNT is required (fail closed). Put it in the
#             gitignored deploy.env or export it. See deploy.env.example.
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
BUILD_VERSION="$(node -p "require('$_SD/package.json').deployVersion")"
# Local, gitignored settings (DEPLOY_AWS_PROFILE / DEPLOY_AWS_ACCOUNT).
# Read before the tenant list is resolved, so TENANTS set here is validated too. Copy deploy.env.example to deploy.env and fill it in.
_DEPLOY_ENV="$_SD/deploy.env"
if [ -f "$_DEPLOY_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$_DEPLOY_ENV"
  set +a
fi

# Tenant list and target metadata are defined once in deploy-targets.json.
_TARGETS_FILE="$_SD/deploy-targets.json"
if [ ! -f "$_TARGETS_FILE" ]; then
  echo "[ERROR] $_TARGETS_FILE not found (cp deploy-targets.example.json deploy-targets.json and fill in the real values; it is gitignored)" >&2
  exit 1
fi
TENANT_LIST="$(DEPLOY_TARGETS_FILE="$_TARGETS_FILE" node -p "Object.keys(JSON.parse(require('fs').readFileSync(process.env.DEPLOY_TARGETS_FILE,'utf8'))).join(' ')")"
if [ -z "$TENANT_LIST" ]; then
  echo "[ERROR] deploy-targets.json has no tenants" >&2
  exit 1
fi
# Which tenant artifact names to publish. One build is copied to each name.
if [ "${TENANT:-}" = "all" ]; then
  TENANTS="${TENANTS:-$TENANT_LIST}"
elif [ -n "${TENANT:-}" ]; then
  TENANTS="${TENANTS:-$TENANT}"
fi
TENANTS="${TENANTS:-$TENANT_LIST}"
for tenant in $TENANTS; do
  case " $TENANT_LIST " in
    *" $tenant "*) ;;
    *) echo "[ERROR] unknown tenant: $tenant (${TENANT_LIST})" >&2; exit 1 ;;
  esac
done


# AWS profile — which credentials upload to S3 and write SSM. This machine holds
# several key sets (other jobs too), so never fall back to `default` or to
# whatever AWS_ACCESS_KEY_ID happens to be exported: an explicit `--profile`
# wins over env keys.
# Override for a run:  DEPLOY_AWS_PROFILE=<name> yarn deploy
DEPLOY_AWS_PROFILE="${DEPLOY_AWS_PROFILE:-60-think}"
# Expected account is required: fail closed rather than upload to whatever
# credentials happen to be active. The value lives in the gitignored deploy.env
# (or the environment), never in tracked source.
if [ -z "${DEPLOY_AWS_ACCOUNT:-}" ]; then
  echo "[ERROR] DEPLOY_AWS_ACCOUNT is not set — refusing to build/upload without an account guard."
  echo "        Copy deploy.env.example to deploy.env and set DEPLOY_AWS_ACCOUNT."
  exit 1
fi
# Checked before the (long) build, so a missing key or a wrong account stops here
# instead of after the image is built.
DEPLOY_AWS_ACTUAL="$(aws sts get-caller-identity --profile "$DEPLOY_AWS_PROFILE" --query Account --output text 2>/dev/null)"
if [ -z "$DEPLOY_AWS_ACTUAL" ] || [ "$DEPLOY_AWS_ACTUAL" = "None" ]; then
  echo "[ERROR] AWS profile '$DEPLOY_AWS_PROFILE' has no usable credentials (aws sts get-caller-identity failed)."
  echo "        Pick a configured profile:  DEPLOY_AWS_PROFILE=<name>  (list: aws configure list-profiles)"
  exit 1
fi
if [ "$DEPLOY_AWS_ACTUAL" != "$DEPLOY_AWS_ACCOUNT" ]; then
  echo "[ERROR] AWS profile '$DEPLOY_AWS_PROFILE' does not match DEPLOY_AWS_ACCOUNT — not deploying."
  exit 1
fi
echo "[INFO] AWS profile: $DEPLOY_AWS_PROFILE (account guard passed)"

# Pre-flight: prd.Dockerfile COPYs the host's pre-built Admin bundle and refuses
# a dev build (its step-27 guard). `yarn dev` rewrites the Admin-X apps as
# symlinks, so catch that here with a clear message — a production Admin build is
# required first — instead of failing deep inside the docker build.
ADMIN_ASSETS="$_SD/ghost/core/core/built/admin/assets"
for app in admin-x-demo admin-x-settings admin-x-activitypub posts stats; do
  if [ -L "$ADMIN_ASSETS/$app" ] || [ ! -f "$ADMIN_ASSETS/$app/$app.js" ]; then
    echo "[ERROR] Admin bundle is a dev build (built/admin/assets/$app is a symlink or missing)."
    echo "        Run a production Admin build first, then re-run this script:  yarn build"
    echo "        (see docs/operations-docker-admin-build.md)"
    exit 1
  fi
done

# Build the image; abort before uploading if the build fails (e.g. the Dockerfile
# Admin guard), so we never `docker save` a non-existent image.
yarn docker:next:build
rc=$?
if [ $rc -ne 0 ]; then
  echo "[ERROR] Image build failed for $IMAGE_NAME:$BUILD_VERSION (exit $rc) — not uploading."
  exit $rc
fi
# docker:next:build tags package.json's deployVersion; honor VERSION overrides.
if [ "$VERSION" != "$BUILD_VERSION" ]; then
  echo "[INFO] retagging $IMAGE_NAME:$BUILD_VERSION -> $IMAGE_NAME:$VERSION"
  docker tag "$IMAGE_NAME:$BUILD_VERSION" "$IMAGE_NAME:$VERSION" || exit 1
fi

# Docker Hub への tag / push は行わない（2026-09-11 決定: 配布は S3 経由のみ）。
# ローカルの $IMAGE_NAME:$VERSION を gzip 圧縮した .tar.gz にして S3 へ上げ、
# 受け側（この repo の deploy-on-ec2.sh）が同じキーを docker load する。
# image は事業/role の ghost を tenant で共有する（tenant 差は機能範囲で扱う）。
GZ_KEY="s3://$S3_BUCKET/$S3_FOLDER/$IMAGE_NAME-$VERSION.tar.gz"
echo "[INFO] Uploading $IMAGE_NAME:$VERSION -> $GZ_KEY (gzip)"
docker save "$IMAGE_NAME:$VERSION" | gzip | aws s3 cp - "$GZ_KEY" --region "$AWS_REGION" --profile "$DEPLOY_AWS_PROFILE"
rc=$?
if [ $rc -ne 0 ]; then
  echo "[ERROR] Upload failed for $GZ_KEY (exit $rc)"
  exit $rc
fi
echo "Upload completed: $GZ_KEY"

# Record the version the host deploy should run. The image is shared by
# tenants; the SSM parameter is per tenant. TENANTS selects which parameters
# to update. news (janabiz) is a separate account and uses its manifest instead.
ssm_param_for() {
  DEPLOY_TARGETS_FILE="$_TARGETS_FILE" node -p "JSON.parse(require('fs').readFileSync(process.env.DEPLOY_TARGETS_FILE,'utf8'))['$1']?.ssmParam || ''"
}
# deploy-targets.json is the single source of the parameter names, and only the
# selected TENANTS are updated. DEPLOY_SSM_PARAMS is no longer read.
if [ -n "${DEPLOY_SSM_PARAMS:-}" ]; then
  echo "[WARN] DEPLOY_SSM_PARAMS is ignored; ssmParam in deploy-targets.json is used for the selected TENANTS" >&2
fi
SSM_PARAMS=""
for tenant in $TENANTS; do
  param="$(ssm_param_for "$tenant")"
  if [ -z "$param" ]; then
    echo "[ERROR] no ssmParam for tenant $tenant in deploy-targets.json" >&2
    exit 1
  fi
  SSM_PARAMS="$SSM_PARAMS $param"
done
if [ "${WRITE_SSM_PARAM:-1}" = "1" ]; then
  for param in $SSM_PARAMS; do
    echo "[INFO] Updating SSM parameter: $param=$VERSION"
    if ! aws ssm put-parameter --region "$AWS_REGION" --profile "$DEPLOY_AWS_PROFILE" \
        --name "$param" --value "$VERSION" --type String --overwrite; then
      echo "[ERROR] Failed to update SSM parameter: $param" >&2
      exit 1
    fi
  done
else
  echo "[INFO] SSM parameter write skipped (WRITE_SSM_PARAM=$WRITE_SSM_PARAM)"
fi

# Clean docker build cache
docker builder prune --force

# Cleanup all
# docker system prune -a
