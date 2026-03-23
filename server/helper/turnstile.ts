import type { Request } from "express";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type SiteverifyResult = {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  action?: string;
};

/** Both env vars must be set for Turnstile to be enforced on password login/signup. */
export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.WIDGET_SECRET_KEY?.trim() && process.env.WIDGET_SITE_KEY?.trim());
}

export function getTurnstileTokenFromBody(body: Record<string, unknown>): string {
  const a = body?.turnstileToken;
  const b = body?.["cf-turnstile-response"];
  if (typeof a === "string" && a.trim()) return a.trim();
  if (typeof b === "string" && b.trim()) return b.trim();
  return "";
}

export function clientIpForTurnstile(req: Request): string | undefined {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) {
    return cf.split(",")[0]!.trim();
  }
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0]!.trim();
  }
  if (typeof req.ip === "string" && req.ip && req.ip !== "::1") return req.ip;
  return undefined;
}

export async function verifyTurnstileToken(token: string, remoteip?: string): Promise<SiteverifyResult> {
  const secret = process.env.WIDGET_SECRET_KEY?.trim();
  if (!secret) {
    return { success: false, "error-codes": ["missing-input-secret"] };
  }
  if (!token || token.length > 2048) {
    return { success: false, "error-codes": ["invalid-input-response"] };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(remoteip ? { remoteip } : {}),
      }),
      signal: controller.signal,
    });
    return (await response.json()) as SiteverifyResult;
  } catch {
    return { success: false, "error-codes": ["internal-error"] };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function requireTurnstileIfConfigured(
  req: Request,
): Promise<{ ok: true } | { ok: false; status: number; payload: Record<string, unknown> }> {
  if (!isTurnstileConfigured()) return { ok: true };
  const token = getTurnstileTokenFromBody(req.body as Record<string, unknown>);
  if (!token) {
    return {
      ok: false,
      status: 400,
      payload: { error: "Verification required.", code: "turnstile_required" },
    };
  }
  const result = await verifyTurnstileToken(token, clientIpForTurnstile(req));
  if (!result.success) {
    return {
      ok: false,
      status: 403,
      payload: { error: "Verification failed. Please try again.", code: "turnstile_failed" },
    };
  }
  return { ok: true };
}
