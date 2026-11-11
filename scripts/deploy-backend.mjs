#!/usr/bin/env node
// Backend deploy orchestrator for 60-think / thinkestate.
//
// Stages (same names as the frontend deploy):
//   --stage build    build + S3 upload + SSM update   (./deploy.sh)
//   --stage deploy   distribute to EC2                (./deploy-on-ec2.sh via SSM)
//   --stage verify   read-only check                  (SSM)
//   --stage all      build -> deploy -> verify (default)
//
// Tenant: --tenant 60-think | thinkestate | all (default 60-think)
// Version: --version <tag> (default: the tenant's SSM parameter)
// Flags: --dry-run  show stage / tenants / version and stop (no AWS call)
//        --yes      skip the production confirmation (non-interactive runs)
//
// Env: deploy.env (gitignored) or the environment:
//   DEPLOY_AWS_PROFILE (default 60-think; build の S3 upload もこれ)
//   DEPLOY_AWS_ACCOUNT (build/upload では必須)
//   テナント別の profile / account は deploy-targets.json の profile / account
//   （未設定なら上の全体値）。SSM の読み書きと account guard はテナントごとの値。

import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const REGION = "ap-northeast-1";
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
const deployVersion = String(pkg.deployVersion || "").trim();
if (!deployVersion) {
  console.error("package.json deployVersion is not set");
  process.exit(2);
}
const STAGES = ["build", "deploy", "verify", "all"];
const TARGETS_FILE = path.join(REPO, "deploy-targets.json");
if (!fs.existsSync(TARGETS_FILE)) {
  console.error("deploy-targets.json not found. Copy deploy-targets.example.json to deploy-targets.json and fill in the real values (it is gitignored).");
  process.exit(2);
}
const TARGETS = JSON.parse(fs.readFileSync(TARGETS_FILE, "utf8"));
if (Object.keys(TARGETS).length === 0) {
  console.error("deploy-targets.json has no tenants");
  process.exit(2);
}
for (const [tenant, target] of Object.entries(TARGETS)) {
  const missing = ["workdir", "ssmParam"].filter((k) => typeof target?.[k] !== "string" || !target[k].trim());
  const hasInstance = typeof target?.instanceId === "string" && target.instanceId.trim();
  const tags = target?.tags;
  const tagsOk =
    tags && typeof tags === "object" && !Array.isArray(tags) &&
    Object.keys(tags).length > 0 &&
    Object.entries(tags).every(([k, v]) => typeof v === "string" && v.trim() && !v.includes(",") && !k.includes(","));
  const hasTags = Boolean(tagsOk);
  if (!hasInstance && !hasTags) missing.push("instanceId（または tags。キー/値はカンマ無しの文字列）");
  if (missing.length) {
    console.error(`deploy-targets.json: ${tenant} is missing ${missing.join(", ")}`);
    process.exit(2);
  }
}

const arg = (name, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? String(process.argv[i + 1] || fallback) : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);
const shq = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

const env = {...loadEnvFile(path.join(REPO, "deploy.env")), ...process.env};
const profile = String(env.DEPLOY_AWS_PROFILE || "60-think").trim();
// Image-tag `.env` is chowned to this user so a manual (non-root) deploy can
// rewrite it. Override with DEPLOY_USER for hosts with a different login.
const deployUser = String(env.DEPLOY_USER || "ubuntu").trim();

// tenant ごとの profile / account は deploy-targets.json に持つ（未設定なら全体値）。
function profileFor(tenant) {
  return String(TARGETS[tenant]?.profile || profile).trim();
}
function accountFor(tenant) {
  return String(TARGETS[tenant]?.account || env.DEPLOY_AWS_ACCOUNT || "").trim();
}

function aws(args, profileName = profile) {
  return execFileSync(
    "aws",
    ["--profile", profileName, "--region", REGION, ...args],
    {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]},
  ).trim();
}

// 配布先: instanceId があればそれ。無ければ tags（例 {"System":"60-think","Role":"backend"}）
// で running のインスタンスを探す。ASG を使っていないので数は増えないが、複数見つかったら
// 取り違えを避けるため中止する。
const instanceCache = new Map();
function instanceFor(tenant) {
  if (instanceCache.has(tenant)) return instanceCache.get(tenant);
  const target = TARGETS[tenant];
  if (typeof target.instanceId === "string" && target.instanceId.trim()) {
    instanceCache.set(tenant, target.instanceId.trim());
    return target.instanceId.trim();
  }
  const filters = ["Name=instance-state-name,Values=running"];
  for (const [key, value] of Object.entries(target.tags)) {
    filters.push(`Name=tag:${key},Values=${value}`);
  }
  const out = aws([
    "ec2", "describe-instances", "--filters", ...filters,
    "--query", "Reservations[].Instances[].InstanceId", "--output", "json",
  ], profileFor(tenant));
  let ids = [];
  try {
    ids = JSON.parse(out);
  } catch {
    ids = [];
  }
  if (ids.length === 1) {
    instanceCache.set(tenant, ids[0]);
    return ids[0];
  }
  console.error(
    `[FATAL] ${tenant}: tags ${JSON.stringify(target.tags)} で instance を 1 台に特定できない` +
      `（見つかった: ${ids.join(", ") || "なし"}）。deploy-targets.json に instanceId を書くこと`,
  );
  process.exit(1);
}

function accountGuard(tenant) {
  const profileName = profileFor(tenant);
  const expected = accountFor(tenant);
  if (!expected) {
    console.error(
      `${tenant} の account が未設定（deploy-targets.json の account か DEPLOY_AWS_ACCOUNT）— abort`,
    );
    process.exit(2);
  }
  const identity = JSON.parse(aws(["sts", "get-caller-identity", "--output", "json"], profileName));
  if (String(identity.Account) !== expected) {
    console.error(`account mismatch for tenant=${tenant} profile=${profileName} — abort`);
    process.exit(1);
  }
}

const stage = arg("stage", "all");
if (!STAGES.includes(stage)) {
  console.error(`--stage must be one of: ${STAGES.join("|")}`);
  process.exit(2);
}
const tenantArg = arg("tenant", "60-think");
const tenants = tenantArg === "all" ? Object.keys(TARGETS) : [tenantArg];
for (const tenant of tenants) {
  if (!TARGETS[tenant]) {
    console.error(`unknown tenant: ${tenant}`);
    process.exit(2);
  }
}
const versionArg = arg("version");
const doBuild = stage === "build" || stage === "all";
const doDeploy = stage === "deploy" || stage === "all";
const doVerify = stage === "verify" || stage === "all";

// --dry-run: show what would happen (stage / tenants / version) and stop
// before any AWS call. `yarn deploy` = all, so this is the way to check the
// plan without touching production.
if (has("dry-run")) {
  const steps = [
    doBuild ? "build: bash ./deploy.sh (image build -> S3 upload -> SSM)" : null,
    doDeploy ? "deploy: install deploy-on-ec2.sh on each target, docker load, restart" : null,
    doVerify ? "verify: read-only (docker inspect / docker ps / curl localhost:80)" : null,
  ].filter(Boolean);
  // --resolve を付けたときだけ EC2 を読む（--dry-run 単体は AWS を呼ばない）。
  const resolve = has("resolve");
  console.log(JSON.stringify({
    stage,
    tenants: tenants.map((t) => ({
      tenant: t,
      profile: profileFor(t),
      account: accountFor(t) || "<unset>",
      target: resolve
        ? instanceFor(t)
        : TARGETS[t].instanceId || `tags ${JSON.stringify(TARGETS[t].tags || {})}`,
    })),
    version: versionArg || "(the tenant's SSM parameter, else package.json deployVersion)",
    steps,
  }, null, 2));
  process.exit(0);
}

const logDir = path.join(REPO, "logs");
fs.mkdirSync(logDir, {recursive: true});
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logPath = path.join(logDir, `deploy-backend-${tenants.join("-")}-${stage}-${stamp}.log`);
const log = (line) => {
  const text = `[${new Date().toISOString()}] ${line}`;
  process.stderr.write(`${text}\n`);
  fs.appendFileSync(logPath, `${text}\n`);
};

// Distribution goes straight to production EC2, so ask before it starts.
// Non-interactive runs (CI, nohup) must say --yes explicitly.
function confirmDeploy() {
  if (!doDeploy || has("yes")) return;
  if (!process.stdin.isTTY) {
    console.error("[ABORT] 非対話では --yes を付けてください（本番への配布は確認必須）");
    process.exit(1);
  }
  const question = `配布します: stage=${stage} tenant=${tenants.join(",")} `
    + `version=${versionArg || "SSM / deployVersion"} -> 本番 EC2。続けますか? [y/N] `;
  const answer = execFileSync(
    "bash",
    ["-c", `read -r -p ${shq(question)} ans; printf %s "$ans"`],
    {encoding: "utf8", stdio: ["inherit", "pipe", "inherit"]},
  ).trim();
  if (!/^y(es)?$/i.test(answer)) {
    console.error("[ABORT] 中止しました（何もしていません）");
    process.exit(1);
  }
}

log(`backend stage=${stage} tenant=${tenants.join(",")}`);
for (const tenant of tenants) {
  log(`[guard] tenant=${tenant} profile=${profileFor(tenant)} account=${accountFor(tenant) || "<unset>"}`);
  accountGuard(tenant);
}
// 配布先も、何も実行する前に全テナント分を解決しておく（途中で止まらないように）。
if (doDeploy || doVerify) {
  for (const tenant of tenants) {
    log(`[target] tenant=${tenant} -> ${instanceFor(tenant)}`);
  }
}
log("account guard passed");
confirmDeploy();
log("deploy confirmed");
log(`log=${logPath}`);

if (doBuild) {
  const buildVersion = versionArg || String(env.VERSION || deployVersion).trim();
  const buildTenants = tenantArg === "all" ? Object.keys(TARGETS).join(" ") : tenantArg;
  log(`[build] bash ./deploy.sh (version=${buildVersion}, tenants=${buildTenants})`);
  execFileSync("bash", [path.join(REPO, "deploy.sh")], {
    cwd: REPO,
    stdio: "inherit",
    env: {...process.env, ...env, VERSION: buildVersion, TENANTS: buildTenants},
  });
  log("[build] success");
}

function resolvedVersion(tenant) {
  if (versionArg) return {version: versionArg, source: "--version"};
  // `all` just built this tag with ./deploy.sh, so use the same package.json
  // deployVersion (or VERSION override) instead of re-reading a possibly stale SSM.
  if (stage === "all") {
    return {version: String(env.VERSION || deployVersion).trim(), source: "package.json deployVersion"};
  }
  try {
    const version = aws([
      "ssm", "get-parameter", "--name", TARGETS[tenant].ssmParam,
      "--query", "Parameter.Value", "--output", "text",
    ], profileFor(tenant));
    return {version, source: `SSM ${TARGETS[tenant].ssmParam}`};
  } catch {
    console.error(`[WARN] SSM parameter not found: ${TARGETS[tenant].ssmParam}; using deployVersion=${deployVersion}`);
    return {version: deployVersion, source: "package.json deployVersion (fallback)"};
  }
}

function runCommand(instanceId, commands, label, profileName = profile) {
  const payload = JSON.stringify({commands, executionTimeout: ["3600"]});
  const commandId = aws([
    "ssm", "send-command", "--instance-ids", instanceId,
    "--document-name", "AWS-RunShellScript", "--comment", `deploy backend ${label}`,
    "--parameters", payload, "--query", "Command.CommandId", "--output", "text",
  ], profileName);
  log(`[${label}] SSM command: ${commandId}`);
  for (let i = 0; i < 720; i++) {
    sleep(5000);
    let invocation;
    try {
      invocation = JSON.parse(aws([
        "ssm", "get-command-invocation", "--command-id", commandId,
        "--instance-id", instanceId, "--output", "json",
      ], profileName));
    } catch {
      continue;
    }
    const status = String(invocation.Status || "");
    if (["InProgress", "Pending", "Delayed"].includes(status)) continue;
    process.stdout.write(String(invocation.StandardOutputContent || ""));
    process.stderr.write(String(invocation.StandardErrorContent || ""));
    log(`[${label}] status=${status}`);
    return status === "Success";
  }
  log(`[${label}] timeout`);
  return false;
}

const scriptB64 = fs.readFileSync(path.join(REPO, "deploy-on-ec2.sh")).toString("base64");
let failed = 0;
for (const tenant of tenants) {
  const {workdir, ssmParam} = TARGETS[tenant];
  const tenantProfile = profileFor(tenant);

  if (doDeploy) {
    const instanceId = instanceFor(tenant);
    const {version, source} = resolvedVersion(tenant);
    log(`[deploy] ${tenant} version=${version} (${source}) artifact=ghost-${version}.tar.gz instance=${instanceId}`);
    // The script is stored next to the compose file (same layout as the
    // frontend / worker deploys) and /usr/local/sbin is only a symlink.
    // Root ownership is explicitness, not a privilege boundary: the workdir is
    // writable by the deploy user, and ubuntu already has passwordless sudo on
    // these hosts. ubuntu can still read/execute the script.
    const scriptPath = path.posix.join(workdir, "deploy-backend-on-ec2.sh");
    const ok = runCommand(instanceId, [
      "#!/bin/bash",
      "set -eu",
      `cd ${shq(workdir)}`,
      `SCRIPT=${shq(scriptPath)}`,
      `export DEPLOY_USER=${shq(deployUser)}`,
      "LINK=/usr/local/sbin/deploy-backend-on-ec2.sh",
      "ts=$(date +%Y%m%dT%H%M%S)",
      '[ -L .backup ] && { echo "[FATAL] .backup is a symlink; refusing" >&2; exit 1; }',
      'mkdir -p .backup',
      // The workdir is writable by the deploy user, so a fixed name (SCRIPT.new)
      // could be pre-planted as a symlink and make root overwrite any file.
      // Stage in a root-only dir on the SAME filesystem, then mv (rename) into
      // place: rename replaces the directory entry and never follows a symlink.
      'STAGE=$(mktemp -d "$PWD/.deploy-stage.XXXXXX")',
      'trap \'rm -rf "$STAGE"\' EXIT',
      'if [ -f "$SCRIPT" ] && [ ! -L "$SCRIPT" ]; then cp -p "$SCRIPT" "$STAGE/script.prev"; fi',
      'if [ -e "$LINK" ] && [ ! -L "$LINK" ]; then cp -p "$LINK" "$STAGE/sbin.prev"; fi',
      // keep the last 10 script backups (they are small, but unbounded growth is noise)
      'ls -1t .backup/deploy-backend-on-ec2.sh.* .backup/sbin-deploy-backend-on-ec2.sh.* 2>/dev/null | tail -n +11 | xargs -r rm -f || true',
      `echo ${shq(scriptB64)} | base64 -d > "$STAGE/deploy-backend-on-ec2.sh"`,
      'chmod 0755 "$STAGE/deploy-backend-on-ec2.sh"',
      'chown root:root "$STAGE/deploy-backend-on-ec2.sh"',
      'mv -fT "$STAGE/deploy-backend-on-ec2.sh" "$SCRIPT"',
      'chown -h root:root "$SCRIPT" 2>/dev/null || true',
      'if [ -f "$STAGE/script.prev" ]; then mv -fT "$STAGE/script.prev" ".backup/deploy-backend-on-ec2.sh.$ts"; chown -h root:root ".backup/deploy-backend-on-ec2.sh.$ts"; fi',
      'if [ -f "$STAGE/sbin.prev" ]; then mv -fT "$STAGE/sbin.prev" ".backup/sbin-deploy-backend-on-ec2.sh.$ts"; chown -h root:root ".backup/sbin-deploy-backend-on-ec2.sh.$ts"; fi',
      'ln -sfn "$SCRIPT" "$LINK"',
      'ls -la "$LINK" "$SCRIPT"',
      // root-owned log dir; ubuntu (manual) falls back to ./logs inside the script
      'install -d -o root -g root -m 0750 /var/log/ghost-deploy 2>/dev/null || true',
      `TENANT=${shq(tenant)} VERSION=${shq(version)} SSM_PARAM=${shq(ssmParam)} bash "$SCRIPT" ${shq(version)}`,
      "",
    ], `deploy-${tenant}`, tenantProfile);
    if (!ok) {
      failed++;
    } else {
      aws([
        "ssm", "put-parameter", "--name", ssmParam,
        "--value", version, "--type", "String", "--overwrite",
      ], tenantProfile);
      log(`[deploy] SSM updated: ${ssmParam}=${version}`);
    }
  }

  if (doVerify) {
    const instanceId = instanceFor(tenant);
    const {version, source} = resolvedVersion(tenant);
    log(`[verify] ${tenant} expected=ghost:${version} (${source})`);
    const ok = runCommand(instanceId, [
      "#!/bin/bash",
      "set -eu",
      `cd ${shq(workdir)}`,
      // Resolve the container from compose labels (no compose config/env needed,
      // works with or without container_name).
      'cid=$(docker ps -q --filter label=com.docker.compose.service=ghost --filter "label=com.docker.compose.project.working_dir=$(pwd)")',
      'if [ -z "$cid" ]; then echo "ghost service is not running"; exit 1; fi',
      "img=$(docker inspect \"$cid\" --format '{{.Config.Image}}')",
      `expected=${shq(`ghost:${version}`)}`,
      'echo "running=$img"',
      'echo "expected=$expected"',
      'if [ "$img" != "$expected" ]; then exit 1; fi',
      "docker ps --format '{{.Names}} {{.Image}} {{.Status}}'",
      "curl -s -o /dev/null -w 'http=%{http_code}\\n' http://localhost:80/ || true",
      "",
    ], `verify-${tenant}`, tenantProfile);
    if (!ok) failed++;
  }
}

if (failed) {
  log(`[ERROR] ${failed} check(s) failed`);
  process.exit(1);
}
log("[OK] backend deploy complete");
