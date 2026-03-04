import type { Request, Response, NextFunction } from "express";
import { hashToken } from "../helper/tokens";
import { databaseStorage } from "../database";

declare global {
  namespace Express {
    interface Request {
      agentId?: string;
      agentOrgId?: string;
    }
  }
}

const LAST_SEEN_DEBOUNCE_MS = 30_000;
const lastSeenCache = new Map<string, number>();

/**
 * Authenticate requests using agent bearer tokens (Authorization: Bearer plg_xxx).
 * Attaches req.agentId and req.agentOrgId on success.
 */
export async function authenticateAgentToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const rawToken = header.slice(7).trim();
  if (!rawToken || !rawToken.startsWith("plg_")) {
    res.status(401).json({ error: "Invalid agent token format" });
    return;
  }

  try {
    const tokenHashValue = hashToken(rawToken);
    const agent = await databaseStorage.getOrganizationAgentByTokenHash(tokenHashValue);
    if (!agent) {
      res.status(401).json({ error: "Invalid or revoked agent token" });
      return;
    }

    req.agentId = agent.id;
    req.agentOrgId = agent.organizationId;

    // Debounced last_seen_at update to avoid a DB write on every request
    const now = Date.now();
    const lastUpdate = lastSeenCache.get(agent.id) ?? 0;
    if (now - lastUpdate > LAST_SEEN_DEBOUNCE_MS) {
      lastSeenCache.set(agent.id, now);
      databaseStorage
        .updateAgentHeartbeat(agent.id, {})
        .catch((err) => console.warn("[agentAuth] last_seen_at update failed:", err));
    }

    next();
  } catch (err) {
    console.error("[agentAuth] error:", err);
    res.status(500).json({ error: "Internal authentication error" });
  }
}
