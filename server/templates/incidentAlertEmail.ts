function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface IncidentAlertMetadata {
  service?: string;
  environment?: string;
  severity?: string;
  route?: string;
  stackFrame?: string;
  requestUrl?: string;
  stacktrace?: Array<{ file: string; function?: string; line?: number }>;
  sourceUrl?: string;
  createdAt?: string;
}

function formatRelativeTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMs / 3_600_000);
    const days = Math.floor(diffMs / 86_400_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
    return d.toLocaleDateString();
  } catch {
    return isoString;
  }
}

export function getIncidentAlertEmailTemplate(
  title: string,
  message: string,
  dashboardUrl: string,
  metadata?: IncidentAlertMetadata
) {
  const escapedTitle = escapeHtml(title);
  const escapedMessage = escapeHtml(message).replace(/\n/g, "<br>");
  const baseUrl = dashboardUrl.replace(/\/dashboard\/?$/, "") || "https://pushlog.ai";
  const logoUrl = `${baseUrl}/PushLog.png`;

  const service = metadata?.service ?? "—";
  const environment = metadata?.environment ?? "—";
  const severity = metadata?.severity ?? "Error";
  const viewUrl = metadata?.sourceUrl || dashboardUrl;
  const viewLabel = metadata?.sourceUrl ? "View in Sentry" : "View in Dashboard";
  const createdAt = metadata?.createdAt
    ? formatRelativeTime(metadata.createdAt)
    : "just now";
  const hasLocation = metadata?.route || metadata?.stackFrame || metadata?.requestUrl;
  const hasStacktrace = metadata?.stacktrace && metadata.stacktrace.length > 0;

  const stackTraceHtml = hasStacktrace
    ? metadata!
        .stacktrace!.map((f) => {
          const filePart = escapeHtml(f.file);
          const linePart =
            f.line != null
              ? `<span style="color: #e8a74c;">:${f.line}</span>`
              : "";
          const fnPart = f.function ? ` (${escapeHtml(f.function)})` : "";
          return `at ${filePart}${linePart}${fnPart}`;
        })
        .join("<br>")
    : "";

  return {
    subject: `[PushLog] ${title}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Notification Details - PushLog</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #1a1d1e;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="background: linear-gradient(145deg, #1e2a24 0%, #1a2520 100%); border-radius: 12px; border: 1px solid #2d3d35; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4);">
      <!-- Logo -->
      <div style="text-align: center; padding: 20px 24px 0;">
        <img src="${logoUrl}" alt="PushLog" width="48" height="48" style="display: inline-block; object-fit: contain;" />
      </div>
      <!-- Header -->
      <div style="padding: 24px 24px 16px;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <div style="flex-shrink: 0;"><table role="presentation" cellpadding="0" cellspacing="0" style="width: 28px; height: 28px; background: #dc3545; border-radius: 50%;"><tr><td align="center" valign="middle" style="color: white; font-size: 14px; font-weight: bold; line-height: 1;">!</td></tr></table></div>
          <div style="flex: 1;">
            <h1 style="margin-right: 4px; font-size: 20px; font-weight: 600; color: #e8ece9;">Notification Details</h1>
            <p style="margin: 8px 0 0; font-size: 16px; font-weight: 600; color: #e8ece9;">${escapedTitle}</p>
            <p style="margin: 6px 0 0; font-size: 14px; color: #9ca3a8;">${escapedMessage}</p>
          </div>
        </div>
      </div>

      <!-- Incident details card -->
      <div style="margin: 0 16px 16px; padding: 20px; background: rgba(45, 61, 53, 0.5); border: 1px solid #2d3d35; border-radius: 8px;">
        <div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 16px;">
          <div style="flex-shrink: 0;"><table role="presentation" cellpadding="0" cellspacing="0" style="width: 20px; height: 20px; background: #dc3545; border-radius: 50%;"><tr><td align="center" valign="middle" style="color: white; font-size: 11px; font-weight: bold; line-height: 1;">!</td></tr></table></div>
          <span style="font-size: 14px; font-weight: 600; color: #e8ece9; margin-right: 4px;">Incident details</span>
        </div>
        <p style="margin: 0 0 16px; font-size: 13px; color: #9ca3a8;">${escapedMessage}</p>

        ${hasLocation ? `
        <!-- LOCATION -->
        <div style="margin-bottom: 16px;">
          <div style="font-size: 11px; font-weight: 600; color: #6b7c74; letter-spacing: 0.5px; margin-bottom: 8px;">LOCATION</div>
          ${metadata?.route ? `<div style="margin-bottom: 6px;"><span style="display: inline-block; padding: 4px 8px; background: #2d3d35; border-radius: 4px; font-family: monospace; font-size: 13px; color: #7dd3a0;">${escapeHtml(metadata.route)}</span></div>` : ""}
          ${metadata?.stackFrame ? `<div style="margin-bottom: 6px;"><span style="display: inline-block; padding: 4px 8px; background: #2d3d35; border-radius: 4px; font-family: monospace; font-size: 13px; color: #7dd3a0;">${escapeHtml(metadata.stackFrame)}</span></div>` : ""}
          ${metadata?.requestUrl ? `<div style="font-size: 13px;"><a href="${escapeHtml(metadata.requestUrl)}" style="color: #7dd3a0; text-decoration: none;">${escapeHtml(metadata.requestUrl)}</a></div>` : ""}
        </div>
        ` : ""}

        <!-- SUMMARY -->
        <div style="margin-bottom: 16px;">
          <div style="font-size: 11px; font-weight: 600; color: #6b7c74; letter-spacing: 0.5px; margin-bottom: 8px;">SUMMARY</div>
          <div style="font-size: 13px; color: #e8ece9;">
            <strong>Service:</strong> ${escapeHtml(String(service))} &nbsp;|&nbsp;
            <strong>Environment:</strong> ${escapeHtml(String(environment))} &nbsp;|&nbsp;
            <strong>Severity:</strong> ${escapeHtml(String(severity))}
          </div>
        </div>

        ${hasStacktrace ? `
        <!-- STACK TRACE -->
        <div>
          <div style="font-size: 11px; font-weight: 600; color: #6b7c74; letter-spacing: 0.5px; margin-bottom: 8px;">STACK TRACE</div>
          <div style="padding: 12px; background: #141a18; border-radius: 6px; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; color: #9ca3a8; line-height: 1.7; border: 1px solid #2d3d35;">${stackTraceHtml}</div>
        </div>
        ` : ""}
      </div>

      <!-- Footer: View link + metadata -->
      <div style="padding: 16px 24px 24px; border-top: 1px solid #2d3d35;">
        <a href="${escapeHtml(viewUrl)}" style="display: inline-flex; align-items: center; gap: 8px; color: #7dd3a0; text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 12px;">
          <span style="font-size: 16px;">↗</span> ${escapeHtml(viewLabel)}
        </a>
        <div style="font-size: 12px; color: #6b7c74;">
          <strong style="color: #9ca3a8;">Type:</strong> incident alert &nbsp;|&nbsp;
          <strong style="color: #9ca3a8;">Created:</strong> ${escapeHtml(createdAt)}
        </div>
      </div>
    </div>
    <p style="margin: 16px 0 0; text-align: center; font-size: 12px; color: #6b7c74;">
      PushLog — Seamlessly connect GitHub with Slack
    </p>
  </div>
</body>
</html>
    `,
  };
}
