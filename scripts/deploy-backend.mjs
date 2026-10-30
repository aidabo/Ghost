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
//
// Env: deploy.env (gitignored) or the environment:
//   DEPLOY_AWS_PROFILE (default 60-think)
//   DEPLOY_AWS_ACCOUNT (required)

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
const profile = env.DEPLOY_AWS_PROFILE || "60-think";
const expectedAccount = String(env.DEPLOY_AWS_ACCOUNT || "").trim();
if (!expectedAccount) {
  console.error("DEPLOY_AWS_ACCOUNT is not set (deploy.env)");
  process.exit(2);
}

function aws(args) {
  return execFileSync(
    "aws",
    ["--profile", profile, "--region", REGION, ...args],
    {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]},
  ).trim();
}

function accountGuard() {
  const identity = JSON.parse(aws(["sts", "get-caller-identity", "--output", "json"]));
  if (String(identity.Account) !== expectedAccount) {
    console.error(`account mismatch for profile=${profile} — abort`);
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

const logDir = path.join(REPO, "logs");
fs.mkdirSync(logDir, {recursive: true});
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logPath = path.join(logDir, `deploy-backend-${tenants.join("-")}-${stage}-${stamp}.log`);
const log = (line) => {
  const text = `[${new Date().toISOString()}] ${line}`;
  process.stderr.write(`${text}\n`);
  fs.appendFileSync(logPath, `${text}\n`);
};

log(`backend stage=${stage} tenant=${tenants.join(",")} profile=${profile}`);
accountGuard();
log("account guard passed");
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
    ]);
    return {version, source: `SSM ${TARGETS[tenant].ssmParam}`};
  } catch {
    console.error(`[WARN] SSM parameter not found: ${TARGETS[tenant].ssmParam}; using deployVersion=${deployVersion}`);
    return {version: deployVersion, source: "package.json deployVersion (fallback)"};
  }
}

function runCommand(instanceId, commands, label) {
  const payload = JSON.stringify({commands, executionTimeout: ["3600"]});
  const commandId = aws([
    "ssm", "send-command", "--instance-ids", instanceId,
    "--document-name", "AWS-RunShellScript", "--comment", `deploy backend ${label}`,
    "--parameters", payload, "--query", "Command.CommandId", "--output", "text",
  ]);
  log(`[${label}] SSM command: ${commandId}`);
  for (let i = 0; i < 720; i++) {
    sleep(5000);
    let invocation;
    try {
      invocation = JSON.parse(aws([
        "ssm", "get-command-invocation", "--command-id", commandId,
        "--instance-id", instanceId, "--output", "json",
      ]));
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
  const {instanceId, workdir, ssmParam} = TARGETS[tenant];

  if (doDeploy) {
    const {version, source} = resolvedVersion(tenant);
    log(`[deploy] ${tenant} version=${version} (${source}) artifact=ghost-${version}.tar.gz instance=${instanceId}`);
    const ok = runCommand(instanceId, [
      "#!/bin/bash",
      "set -eu",
      `cd ${shq(workdir)}`,
      "SCRIPT=/usr/local/sbin/deploy-backend-on-ec2.sh",
      `echo ${shq(scriptB64)} | base64 -d > "$SCRIPT.new"`,
      'chmod 0700 "$SCRIPT.new"',
      'mv "$SCRIPT.new" "$SCRIPT"',
      `TENANT=${shq(tenant)} VERSION=${shq(version)} SSM_PARAM=${shq(ssmParam)} bash "$SCRIPT" ${shq(version)}`,
      "",
    ], `deploy-${tenant}`);
    if (!ok) {
      failed++;
    } else {
      aws([
        "ssm", "put-parameter", "--name", ssmParam,
        "--value", version, "--type", "String", "--overwrite",
      ]);
      log(`[deploy] SSM updated: ${ssmParam}=${version}`);
    }
  }

  if (doVerify) {
    const {version, source} = resolvedVersion(tenant);
    log(`[verify] ${tenant} expected=ghost:${version} (${source})`);
    const ok = runCommand(instanceId, [
      "#!/bin/bash",
      "set -eu",
      `cd ${shq(workdir)}`,
      "img=$(docker inspect ghost --format '{{.Config.Image}}')",
      `expected=${shq(`ghost:${version}`)}`,
      'echo "running=$img"',
      'echo "expected=$expected"',
      'if [ "$img" != "$expected" ]; then exit 1; fi',
      "docker ps --format '{{.Names}} {{.Image}} {{.Status}}'",
      "curl -s -o /dev/null -w 'http=%{http_code}\\n' http://localhost:80/ || true",
      "",
    ], `verify-${tenant}`);
    if (!ok) failed++;
  }
}

if (failed) {
  log(`[ERROR] ${failed} check(s) failed`);
  process.exit(1);
}
log("[OK] backend deploy complete");
