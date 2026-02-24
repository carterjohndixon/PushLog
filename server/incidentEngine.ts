/**
 * PushLog Incident Engine — Node integration (long-lived subprocess).
 * Keeps one Rust process alive so in-memory stats persist across events.
 */

import fs from "fs";
import path from "path";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { fileURLToPath } from "url";
import readline from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface IncidentFrameInput {
  file: string;
  function?: string;
  line?: number;
}

export interface IncidentCommitInput {
  id: string;
  timestamp?: string;
  files: string[];
  /** Optional 0–100 impact/risk score for correlation weighting. */
  risk_score?: number;
}

export interface IncidentChangeWindowInput {
  deploy_time: string;
  commits: IncidentCommitInput[];
}

export interface IncidentCorrelationHintsInput {
  critical_paths?: string[];
  low_priority_paths?: string[];
}

export interface IncidentEventInput {
  source: string;
  service: string;
  environment: string;
  timestamp: string;
  severity: "warning" | "error" | "critical";
  exception_type: string;
  message: string;
  stacktrace: IncidentFrameInput[];
  tags?: Record<string, string>;
  links?: Record<string, string>;
  change_window?: IncidentChangeWindowInput;
  /** Optional: boost commits touching critical_paths, downweight docs/tests-only. */
  correlation_hints?: IncidentCorrelationHintsInput;
  /** Optional: API route path (e.g. /api/test/throw) for incident emails. */
  api_route?: string;
  /** Optional: Full request URL for incident emails. */
  request_url?: string;
}

export interface IncidentSummaryOutput {
  incident_id: string;
  title: string;
  service: string;
  environment: string;
  severity: "warning" | "error" | "critical";
  priority_score: number;
  trigger: "spike" | "new_issue" | "regression" | "deploy";
  start_time: string;
  last_seen: string;
  links?: Record<string, string>;
}

type IncidentListener = (summary: IncidentSummaryOutput) => void;

let child: ChildProcessWithoutNullStreams | null = null;
let started = false;
let listeners: IncidentListener[] = [];
let restarting = false;
let eventQueue: IncidentEventInput[] = [];
const MAX_QUEUE_SIZE = 100; // Prevent memory leak from unbounded queue

function getBinaryPath(): string {
  if (process.env.INCIDENT_ENGINE_BIN) return process.env.INCIDENT_ENGINE_BIN;
  const root = path.join(__dirname, "..");
  const release = path.join(root, "target", "release", "incident-engine");
  const debug = path.join(root, "target", "debug", "incident-engine");
  if (fs.existsSync(release)) return release;
  if (fs.existsSync(debug)) return debug;
  return release;
}

function parseAndDispatch(line: string): void {
  const raw = line.trim();
  if (!raw) return;

  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    if (payload.error === true) {
      console.warn("[incident-engine] input error:", payload);
      return;
    }

    const summary = payload as unknown as IncidentSummaryOutput;
    if (summary.incident_id && summary.title) {
      for (const listener of listeners) listener(summary);
    }
  } catch (err) {
    console.warn("[incident-engine] stdout parse error:", err);
  }
}

function spawnEngine(): void {
  const bin = getBinaryPath();
  const cwd = path.join(__dirname, "..");

  child = spawn(bin, [], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd,
  });

  started = true;
  restarting = false;

  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", parseAndDispatch);

  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8").trim();
    if (text) console.warn("[incident-engine]", text);
  });

  child.on("error", (err) => {
    console.warn("[incident-engine] spawn error:", err.message);
  });

  child.on("close", (code, signal) => {
    started = false;
    child = null;
    rl.close();
    console.warn("[incident-engine] exited", { code, signal });

    // Best-effort auto-restart unless process is shutting down.
    if (!restarting && process.env.NODE_ENV !== "test") {
      restarting = true;
      setTimeout(() => {
        try {
          ensureIncidentEngineStarted();
          // Flush queue after restart
          flushEventQueue();
        } catch (e) {
          restarting = false;
          console.warn("[incident-engine] restart failed:", e);
        }
      }, 500);
    }
  });
}

/** Flush queued events to the engine (called after engine becomes ready). */
function flushEventQueue(): void {
  if (eventQueue.length === 0) return;

  const flushedCount = eventQueue.length;

  while (eventQueue.length > 0) {
    if (!child || child.killed || !child.stdin.writable) {
      console.warn(`[incident-engine] engine not ready during flush, ${eventQueue.length} events remain queued`);
      break;
    }

    const event = eventQueue.shift();
    if (event) {
      try {
        child.stdin.write(`${JSON.stringify(event)}\n`);
      } catch (err) {
        console.warn("[incident-engine] flush write failed:", err);
        // Re-queue at front if write failed
        eventQueue.unshift(event);
        break;
      }
    }
  }
}

export function ensureIncidentEngineStarted(): void {
  if (started && child && !child.killed) return;
  spawnEngine();
}

export function onIncidentSummary(listener: IncidentListener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function ingestIncidentEvent(event: IncidentEventInput): void {
  try {
    ensureIncidentEngineStarted();

    // If engine not ready, queue the event instead of dropping it
    if (!child || child.killed || !child.stdin.writable) {
      if (eventQueue.length >= MAX_QUEUE_SIZE) {
        console.warn(`[incident-engine] queue full (${MAX_QUEUE_SIZE}), dropping oldest event`);
        eventQueue.shift(); // Drop oldest to prevent unbounded growth
      }
      eventQueue.push(event);
      console.warn(`[incident-engine] engine not ready, queued event (${eventQueue.length} pending)`);
      return;
    }

    // Flush any queued events first (FIFO order)
    flushEventQueue();

    // Write the new event
    child.stdin.write(`${JSON.stringify(event)}\n`);
  } catch (err) {
    console.warn("[incident-engine] ingest failed:", err);
    // On write error, queue the event for retry
    if (eventQueue.length < MAX_QUEUE_SIZE) {
      eventQueue.push(event);
      console.warn(`[incident-engine] write error, queued event for retry (${eventQueue.length} pending)`);
    }
  }
}

export function stopIncidentEngine(): void {
  if (!child || child.killed) return;
  try {
    child.kill("SIGTERM");
  } catch (err) {
    console.warn("[incident-engine] stop failed:", err);
  } finally {
    started = false;
    child = null;
  }
}

/** Get current engine status and queue metrics (for monitoring/debugging). */
export function getIncidentEngineStatus(): {
  running: boolean;
  queuedEvents: number;
  maxQueueSize: number;
} {
  return {
    running: started && !!child && !child.killed,
    queuedEvents: eventQueue.length,
    maxQueueSize: MAX_QUEUE_SIZE,
  };
}

