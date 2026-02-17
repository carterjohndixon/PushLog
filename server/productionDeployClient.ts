/**
 * Client for the production server's deploy webhook API.
 * Used by the staging server to start/cancel promotions and read status
 * without inlining HTTP calls inside route handlers.
 */

const PROMOTE_PROD_WEBHOOK_URL = process.env.PROMOTE_PROD_WEBHOOK_URL || "";
const PROMOTE_PROD_WEBHOOK_SECRET = process.env.PROMOTE_PROD_WEBHOOK_SECRET || "";

function baseUrl(): string | null {
  if (!PROMOTE_PROD_WEBHOOK_URL) return null;
  try {
    const u = new URL(PROMOTE_PROD_WEBHOOK_URL);
    u.pathname = "";
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-promote-secret": PROMOTE_PROD_WEBHOOK_SECRET,
  };
}

/** Whether the production webhook is configured (staging can call production). */
export function isProductionDeployConfigured(): boolean {
  return !!(PROMOTE_PROD_WEBHOOK_URL && PROMOTE_PROD_WEBHOOK_SECRET);
}

/** Ask the production server to start a promotion. */
export async function requestProductionPromote(params: {
  promotedBy: string;
  headSha?: string;
  isRollback?: boolean;
}): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string }> {
  const url = baseUrl();
  if (!url) return { ok: false, status: 500, error: "Production webhook URL not configured" };

  const target = `${url}/api/webhooks/promote-production`;
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        promotedBy: params.promotedBy,
        headSha: params.headSha || undefined,
        isRollback: params.isRollback || false,
      }),
    });
  } catch (err: any) {
    return { ok: false, status: 502, error: err?.message || "Could not reach production server" };
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: (body as any)?.error || "Production webhook failed" };
  }
  return { ok: true, data: body };
}

/** Ask the production server to cancel an in-progress promotion. */
export async function requestProductionCancel(params: { cancelledBy: string }): Promise<
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: string }
> {
  const url = baseUrl();
  if (!url) return { ok: false, status: 500, error: "Production webhook URL not configured" };

  const target = `${url}/api/webhooks/promote-production/cancel`;
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ cancelledBy: params.cancelledBy }),
    });
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      error: "Could not reach production server to cancel. Check PROMOTE_PROD_WEBHOOK_URL and network.",
    };
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (body as any)?.error ||
      (res.status === 401 ? "Production secret mismatch (PROMOTE_PROD_WEBHOOK_SECRET)" : "Cancel failed");
    return { ok: false, status: res.status, error: msg };
  }
  return { ok: true, data: body };
}

/** Fetch promotion status from the production server. */
export async function getProductionPromotionStatus(): Promise<
  | { ok: true; data: unknown }
  | { ok: false; error: string }
> {
  const url = baseUrl();
  if (!url) return { ok: false, error: "Production webhook URL not configured" };

  const target = `${url}/api/webhooks/promote-production/status`;
  try {
    const res = await fetch(target, {
      headers: { "x-promote-secret": PROMOTE_PROD_WEBHOOK_SECRET },
    });
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, data: body };
      return { ok: false, error: (body as any)?.error || `Status API failed (${res.status})` };
    }
    const text = await res.text().catch(() => "");
    const snippet = text.slice(0, 120).replace(/\s+/g, " ").trim();
    return {
      ok: false,
      error: `Status API returned non-JSON (${res.status}). ${snippet}`,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Status API unavailable" };
  }
}
