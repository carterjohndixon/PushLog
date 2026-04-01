#!/usr/bin/env node
/**
 * Promote HTTP server — handles production promotion webhooks for Docker deployments.
 * Replaces the in-container webhook handlers when production runs in Docker.
 *
 * Serve at /api/webhooks/promote-production, /cancel, /status
 * Must match productionDeployClient.ts expectations.
 *
 * NOTE: This file uses CommonJS (require) because it runs inside a minimal
 * docker:24-cli Alpine container that has no package.json with "type":"module".
 */

const { createServer } = require("http");
const { exec } = require("child_process");
const { promisify } = require("util");
const { readFileSync, existsSync, writeFileSync, appendFileSync, unlinkSync } = require("fs");
const { join } = require("path");

const execAsync = promisify(exec);

const PORT = Number(process.env.PROMOTE_HTTP_PORT) || 3999;
const WORKSPACE = process.env.PROMOTE_WORKSPACE || "/workspace";
const SECRET = process.env.PROMOTE_PROD_WEBHOOK_SECRET || "";

const LOCK_FILE = join(WORKSPACE, ".promote-production.lock");
const LOG_FILE = join(WORKSPACE, "deploy-production.log");
const SHA_FILE = join(WORKSPACE, ".prod_deployed_sha");
const AT_FILE = join(WORKSPACE, ".prod_deployed_at");
const PROMOTE_SCRIPT = join(WORKSPACE, "scripts/promote-production-docker.sh");

function readLastLines(filePath, maxLines = 80) {
  try {
    if (!existsSync(filePath)) return [];
    const content = readFileSync(filePath, "utf8");
    return content
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter(Boolean)
      .slice(-maxLines);
  } catch {
    return [];
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function auth(req) {
  const provided = String(req.headers["x-promote-secret"] || "");
  return SECRET && provided === SECRET;
}

async function runGit(cmd, cwd = WORKSPACE) {
  try {
    const { stdout } = await execAsync(cmd, { cwd });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function fetchRecentCommitsFromGitHub(limit = 30) {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_PAT || "";
  const url = `https://api.github.com/repos/carterjohndixon/PushLog/commits?per_page=${limit}`;
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const arr = await res.json();
    return arr.map((c) => ({
      sha: c.sha,
      shortSha: (c.sha || "").slice(0, 7),
      dateIso: c.commit?.author?.date || "",
      author: c.commit?.author?.name || "unknown",
      subject: (c.commit?.message || "").split("\n")[0] || "",
    }));
  } catch {
    return [];
  }
}

async function getStatusPayload() {
  let lockData = null;
  if (existsSync(LOCK_FILE)) {
    try {
      lockData = JSON.parse(readFileSync(LOCK_FILE, "utf8"));
    } catch {
      lockData = { raw: readFileSync(LOCK_FILE, "utf8").trim() };
    }
  }

  const prodDeployedSha = existsSync(SHA_FILE) ? readFileSync(SHA_FILE, "utf8").trim() : null;
  const prodDeployedAt = existsSync(AT_FILE) ? readFileSync(AT_FILE, "utf8").trim() : null;

  let branch = "unknown";
  let headSha = "";
  let recentCommits = [];
  let branchRef = null;

  const gitDir = join(WORKSPACE, ".git");
  if (existsSync(gitDir)) {
    await runGit("git fetch origin", WORKSPACE).catch(() => {});
    const branchOut = await runGit("git rev-parse --abbrev-ref HEAD");
    const isDetached = branchOut === "HEAD";

    for (const ref of ["origin/main", "origin/master", "main"]) {
      const sha = await runGit(`git rev-parse ${ref}`);
      if (sha) {
        branchRef = ref;
        if (branch === "unknown") branch = ref.replace("origin/", "");
        break;
      }
    }

    if (branchRef) {
      headSha = await runGit(`git rev-parse ${branchRef}`);
      const logOut = await runGit(`git log --pretty=format:'%H|%h|%ad|%an|%s' --date=iso ${branchRef} -n 30`);
      recentCommits = logOut
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [sha, shortSha, dateIso, author, ...subjectParts] = line.split("|");
          return { sha, shortSha, dateIso, author, subject: subjectParts.join("|") };
        });
    }
  }

  const githubCommits = await fetchRecentCommitsFromGitHub(100);
  if (githubCommits.length > 0) {
    recentCommits = githubCommits;
    if (!headSha && recentCommits[0]) headSha = recentCommits[0].sha;
    if (branch === "unknown") branch = "main";
  }

  let pendingCount = 0;
  let pendingCommits = [];
  if (prodDeployedSha && headSha && branchRef) {
    try {
      const countOut = await runGit(`git rev-list --count ${prodDeployedSha}..${branchRef}`);
      const pendingOut = await runGit(`git log --pretty=format:'%H|%h|%ad|%an|%s' --date=iso ${prodDeployedSha}..${branchRef} -n 30`);
      pendingCount = Number(countOut || "0");
      pendingCommits = pendingOut
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [sha, shortSha, dateIso, author, ...subjectParts] = line.split("|");
          return { sha, shortSha, dateIso, author, subject: subjectParts.join("|") };
        });
    } catch {}
  }
  if (pendingCommits.length === 0 && recentCommits.length > 0 && prodDeployedSha) {
    const matches = (c) => {
      const d = prodDeployedSha.trim().toLowerCase();
      const full = (c.sha || "").trim().toLowerCase();
      const short = (c.shortSha || full.slice(0, 7)).toLowerCase();
      return d === full || d === short || full.startsWith(d) || short.startsWith(d);
    };
    const idx = recentCommits.findIndex(matches);
    if (idx >= 0) {
      pendingCommits = recentCommits.slice(0, idx);
    } else {
      pendingCommits = [...recentCommits];
    }
    pendingCount = pendingCommits.length;
  }

  return {
    inProgress: existsSync(LOCK_FILE),
    lock: lockData,
    recentLogLines: readLastLines(LOG_FILE, 80),
    prodDeployedSha,
    prodDeployedAt,
    branch,
    headSha,
    recentCommits,
    pendingCount,
    pendingCommits,
  };
}

const server = createServer(async (req, res) => {
  const urlObj = new URL(req.url || "/", `http://localhost`);
  const pathname = urlObj.pathname;

  if (pathname === "/api/webhooks/promote-production/status" && req.method === "GET") {
    if (!auth(req)) return json(res, { error: "Unauthorized" }, 401);
    try {
      const data = await getStatusPayload();
      return json(res, data);
    } catch (e) {
      return json(res, { error: String(e.message || e) }, 500);
    }
  }

  if (pathname === "/api/webhooks/promote-production/cancel" && req.method === "POST") {
    if (!auth(req)) return json(res, { error: "Unauthorized" }, 401);
    try {
      if (!existsSync(LOCK_FILE)) {
        return json(res, { message: "No promotion in progress", cancelledAt: new Date().toISOString() });
      }
      try {
        await execAsync("pkill -f promote-production-docker.sh || true", { cwd: WORKSPACE });
      } catch {}
      try {
        unlinkSync(LOCK_FILE);
      } catch {}
      const body = await parseBody(req);
      const cancelLine = `[${new Date().toISOString().replace("T", " ").slice(0, 19)}] Promotion CANCELLED by ${body.cancelledBy || "admin"}\n`;
      appendFileSync(LOG_FILE, cancelLine);
      return json(res, { message: "Promotion cancelled", cancelledAt: new Date().toISOString() });
    } catch (e) {
      return json(res, { error: String(e.message || e) }, 500);
    }
  }

  if (pathname === "/api/webhooks/promote-production" && req.method === "POST") {
    if (!auth(req)) return json(res, { error: "Unauthorized" }, 401);
    if (!existsSync(PROMOTE_SCRIPT)) {
      return json(res, { error: "promote-production-docker.sh not found at " + PROMOTE_SCRIPT }, 500);
    }
    if (existsSync(LOCK_FILE)) {
      return json(res, { error: "Promotion already in progress" }, 409);
    }

    const body = await parseBody(req);
    const targetSha = String(body.headSha || "").trim();
    const isRollback = !!body.isRollback;
    const promotedBy = String(body.promotedBy || "staging-admin");
    const vitePaying =
      body.viteIsPayingEnabled === true || body.viteIsPayingEnabled === false
        ? body.viteIsPayingEnabled
        : undefined;

    const lockData = {
      startedAt: new Date().toISOString(),
      byWebhook: true,
      by: promotedBy,
      targetSha: targetSha || undefined,
      isRollback: isRollback || undefined,
      viteIsPayingEnabled: vitePaying,
    };
    try {
      writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2));
    } catch (e) {
      console.error("[promote-http] Failed to write lock file:", e);
      return json(
        res,
        {
          error:
            `Cannot write ${LOCK_FILE}: ${e.message}. On the host, chown the bind-mounted repo to the UID/GID ` +
            `reported by: docker exec pushlog-promote id`,
        },
        500
      );
    }

    const logPath = join(WORKSPACE, "deploy-promotion-stdout.log");
    const cmd = `nohup setsid bash "${PROMOTE_SCRIPT}" </dev/null >>"${logPath}" 2>&1 &`;
    console.log(
      `[promote-http] Starting promotion: sha=${targetSha.slice(0, 10) || "latest"}, by=${promotedBy}, viteIsPayingEnabled=${vitePaying === undefined ? "inherit" : vitePaying}`
    );
    const childEnv = {
      ...process.env,
      PROMOTE_WORKSPACE: WORKSPACE,
      PROMOTED_BY: promotedBy,
      PROMOTED_SHA: targetSha,
      PROMOTE_LOCK_FILE: LOCK_FILE,
    };
    if (vitePaying === true) {
      childEnv.VITE_IS_PAYING_ENABLED = "true";
    } else if (vitePaying === false) {
      childEnv.VITE_IS_PAYING_ENABLED = "false";
    } else {
      delete childEnv.VITE_IS_PAYING_ENABLED;
    }
    exec(cmd, {
      cwd: WORKSPACE,
      env: childEnv,
    });

    return json(res, {
      message: "Production promotion started",
      startedAt: new Date().toISOString(),
    });
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[promote-http] Listening on ${PORT}, workspace=${WORKSPACE}, secret=${SECRET ? "configured" : "NOT SET"}`);
});
