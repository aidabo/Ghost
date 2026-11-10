#!/bin/bash
#
# deploy-on-ec2.sh — backend (ghost) deploy on the EC2 host.
#
#   Version : env VERSION > 1st arg > SSM parameter > workdir/.env (running tag)
#             > deploy.version (stale by design; last resort)
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
# 実体の場所を基準にする。この script は compose の作業ディレクトリに置き、
# /usr/local/sbin/deploy-backend-on-ec2.sh から symlink で呼べるようにする。
# symlink 経由でも `docker compose` が compose ファイルを見つけられるよう cd する。
SELF="$0"
if command -v readlink >/dev/null 2>&1; then
  SELF="$(readlink -f "$0" 2>/dev/null || printf '%s' "$0")"
fi
DIR="$(cd "$(dirname "$SELF")" && pwd)"
cd "$DIR"

# --- version resolution -------------------------------------------------------
# どの出どころの値かは失敗時に効くので、最後まで持ち回る。
VERSION_SOURCE="${VERSION:+environment}"
if [ -z "${VERSION:-}" ] && [ -n "${1:-}" ]; then
  VERSION="$1"
  VERSION_SOURCE="argument"
fi
if [ -z "${VERSION:-}" ] && [ -n "$SSM_PARAM" ] && command -v aws >/dev/null 2>&1; then
  VERSION="$(aws ssm get-parameter --region "$AWS_REGION" --name "$SSM_PARAM" \
    --query Parameter.Value --output text 2>/dev/null || true)"
  if [ -n "${VERSION:-}" ]; then
    VERSION_SOURCE="SSM $SSM_PARAM"
    echo "[INFO] VERSION from SSM $SSM_PARAM: $VERSION"
  fi
fi
if [ -z "${VERSION:-}" ] && [ -f "$DIR/.env" ]; then
  # 手動実行の既定は「いま動いている tag」。deploy.version はビルド時の控えで
  # 古いことがあるため、配備のたびにこの script が書く .env を先に見る。
  VERSION="$(grep -E '^GHOST_IMAGE_TAG=' "$DIR/.env" | head -n1 | cut -d= -f2- || true)"
  if [ -n "${VERSION:-}" ]; then
    VERSION_SOURCE="$DIR/.env"
    echo "[INFO] VERSION from $DIR/.env: $VERSION"
  fi
fi
if [ -z "${VERSION:-}" ]; then
  for vf in "$DIR/deploy.version" "$PWD/deploy.version"; do
    [ -f "$vf" ] || continue
    VERSION="$(grep -vE '^[[:space:]]*(#|$)' "$vf" | head -n1)"
    VERSION="${VERSION#VERSION=}"
    VERSION="${VERSION#\"}"; VERSION="${VERSION%\"}"
    VERSION="${VERSION#\'}"; VERSION="${VERSION%\'}"
    if [ -n "$VERSION" ]; then
      VERSION_SOURCE="$vf"
      echo "[WARN] VERSION from $vf (build-time note; can be stale): $VERSION" >&2
      break
    fi
  done
fi
if [ -z "${VERSION:-}" ]; then
  echo "[ERROR] VERSION not set. Pass it: ./deploy-on-ec2.sh <VERSION>" >&2
  echo "        (or set $SSM_PARAM / run once so workdir/.env has the tag / place deploy.version next to this script)" >&2
  exit 1
fi
# The tag goes into an S3 key and a Docker tag; refuse anything outside a
# conservative tag alphabet.
case "$VERSION" in
  ""|*[!A-Za-z0-9._-]*|[.-]*|*[.-])
    echo "[ERROR] invalid VERSION: $VERSION (from ${VERSION_SOURCE:-unknown})" >&2
    exit 1
    ;;
esac

# --- logging -----------------------------------------------------------------
LOG_DIR="${LOG_DIR:-/var/log/ghost-deploy}"
# 配備は root（SSM）でも ubuntu でも走る。root が作った 0755 の dir は ubuntu から
# 書けないので、書けるかどうかまで見る（tee が失敗すると以降のログが消える）。
if ! { mkdir -p "$LOG_DIR" 2>/dev/null && [ -w "$LOG_DIR" ]; }; then
  LOG_DIR="$DIR/logs"
  mkdir -p "$LOG_DIR"
fi
LOG="$LOG_DIR/backend-$(date +%Y%m%dT%H%M%S%z).log"
exec > >(tee -a "$LOG") 2>&1
echo "[INFO] deploy start tenant=$TENANT version=$VERSION (from ${VERSION_SOURCE:-unknown}) dir=$DIR log=$LOG"

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

# 手で `docker compose down/up` を叩くときにも同じイメージタグが要る。
# 配備は --env-file で一時ファイル（秘密を含む）を渡しているため、SSM で入った
# 素のシェルには GHOST_IMAGE_TAG が無く、`${GHOST_IMAGE_TAG:?...}` で落ちる。
# compose と同じディレクトリに「タグだけ」の .env を置き、手動操作でも同じタグを
# 引けるようにする（秘密は書かない）。
#
# **検証が通ってから**書く。途中で失敗したときに .env だけ新 tag になると、手動の
# `docker compose` が存在しない／未稼働の tag を指してしまう。symlink はたどらず、
# 同一 dir の temp から mv で置き換える。
write_tag_env() {
  if [ -L "$DIR/.env" ]; then
    echo "[FATAL] $DIR/.env is a symlink; refusing to write" >&2
    return 1
  fi
  # 固定名だと、deploy user が先に symlink を置いて root に任意ファイルを書かせられる。
  # mktemp は O_EXCL で作るので、置かれた symlink をたどらない。
  TMP="$(mktemp "$DIR/.env.tmp.XXXXXX")" || {
    echo "[FATAL] cannot create a temp file in $DIR" >&2
    return 1
  }
  # source しても効くよう export を付ける（compose の .env も export を受ける）。
  if ! printf 'export GHOST_IMAGE_TAG=%s\n' "$VERSION" > "$TMP"; then
    rm -f "$TMP"
    echo "[FATAL] cannot write $DIR/.env (owner: $(ls -ld "$DIR" | awk '{print $3}'))" >&2
    return 1
  fi
  chmod 0644 "$TMP"
  # root（SSM）で配備したあとでも ubuntu の手動実行が .env を書けるようにする。
  chown "${DEPLOY_USER:-ubuntu}:${DEPLOY_USER:-ubuntu}" "$TMP" 2>/dev/null || true
  # この script は set -e ではないので、mv の失敗を自分で拾って後片付けする。
  # rename は directory entry を置き換えるので、置かれた symlink をたどらない。
  if ! mv -f "$TMP" "$DIR/.env"; then
    rm -f "$TMP"
    echo "[FATAL] cannot replace $DIR/.env (owner: $(ls -ld "$DIR" | awk '{print $3}'))" >&2
    return 1
  fi
  echo "[INFO] wrote $DIR/.env (GHOST_IMAGE_TAG=$VERSION) for manual docker compose"
}

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

# 検証が通ったので、手動 compose 用の tag を確定する。
write_tag_env || exit 1

# --- mandatory post-deploy log ------------------------------------------------
echo "=== docker compose ps ==="
"${COMPOSE[@]}" ps "$SERVICE_NAME" || true
sleep 3
echo "=== recent container logs (tail 100) ==="
"${COMPOSE[@]}" logs --tail=100 --no-color "$SERVICE_NAME" || true

docker images | grep "<none>" | awk '{print $3}' | xargs -r docker rmi --force || true

echo "[OK] deploy complete version=$VERSION log=$LOG"
