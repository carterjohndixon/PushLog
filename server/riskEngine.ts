/**
 * PushLog Risk Engine — Node integration (subprocess).
 * Spawns the Rust binary, writes JSON to stdin, reads JSON from stdout.
 */

import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_TIMEOUT_MS = 5000;

/** Input from webhook pushData (camelCase). Sent to Rust as snake_case. */
export interface ScorePushInput {
  commitMessage: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
  diffText?: string;
}

/** Output from Rust (snake_case). */
export interface RiskResult {
  impact_score: number;
  risk_flags: string[];
  change_type_tags: string[];
  hotspot_files: string[];
  explanations: string[];
}

function getBinaryPath(): string {
  if (process.env.RISK_ENGINE_BIN) return process.env.RISK_ENGINE_BIN;
  const root = path.join(__dirname, "..");
  const release = path.join(root, "target", "release", "risk-engine");
  const debug = path.join(root, "target", "debug", "risk-engine");
  if (fs.existsSync(release)) return release;
  if (fs.existsSync(debug)) return debug;
  return release;
}

/** Build the JSON object Rust expects (snake_case). */
function toRustInput(input: ScorePushInput): Record<string, unknown> {
  return {
    commit_message: input.commitMessage,
    files_changed: input.filesChanged,
    additions: input.additions,
    deletions: input.deletions,
    ...(input.diffText != null && { diff_text: input.diffText }),
  };
}

/**
 * Run the risk-engine binary with the given push data.
 * Returns the parsed result, or a safe fallback on timeout/error (does not throw).
 */
export async function scorePush(input: ScorePushInput): Promise<RiskResult> {
  const bin = getBinaryPath();
  const payload = JSON.stringify(toRustInput(input));
  const timeoutMs = Number(process.env.RISK_ENGINE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const child = spawn(bin, [], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: path.join(__dirname, ".."),
    });

    const chunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));

    const fallback: RiskResult = {
      impact_score: 0,
      risk_flags: [],
      change_type_tags: [],
      hotspot_files: [],
      explanations: [],
    };

    const done = (result: RiskResult) => {
      if (!child.killed) child.kill();
      resolve(result);
    };

    const timeout = setTimeout(() => {
      console.warn("[risk-engine] Timeout, using fallback");
      done(fallback);
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timeout);
      console.warn("[risk-engine] Spawn error:", err.message);
      done(fallback);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        console.warn("[risk-engine] Exit", code, signal);
        done(fallback);
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        const parsed = JSON.parse(raw) as RiskResult;
        done(parsed);
      } catch (e) {
        console.warn("[risk-engine] Parse error:", e);
        done(fallback);
      }
    });

    child.stdin?.write(payload, "utf8", () => {
      child.stdin?.end();
    });
  });
}
