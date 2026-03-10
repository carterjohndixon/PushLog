function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface RelatedCommitForEmail {
  sha: string;
  shortSha: string;
  message: string;
  author: { login: string; name?: string | null };
  htmlUrl: string;
  timestamp: string;
  touchesErrorLine?: boolean;
  lineDistance?: number;
  score?: number;
}

export interface IncidentAlertMetadata {
  service?: string;
  environment?: string;
  severity?: string;
  route?: string;
  stackFrame?: string;
  requestUrl?: string;
  stacktrace?: Array<{ file: string; function?: string; line?: number }>;
  /** When true, stack trace is from bundled/minified build; show hint to upload source maps to Sentry. */
  stackTraceIsBundled?: boolean;
  sourceUrl?: string;
  createdAt?: string;
  /** Actual error message that triggered the incident (from Sentry/engine). */
  errorMessage?: string;
  /** Exception type (e.g. TypeError, Error). */
  exceptionType?: string;
  /** Related commits from GitHub correlation. */
  relatedCommits?: RelatedCommitForEmail[];
  /** Potentially relevant authors from those commits. */
  relevantAuthors?: Array<{ login: string; name?: string | null }>;
  /** The file path that was correlated. */
  correlatedFile?: string;
  /** The line number that was correlated. */
  correlatedLine?: number;
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
  metadata?: IncidentAlertMetadata,
  /** When true, use cid:pushlog-logo (embedded). When false, use external URL. */
  useEmbeddedLogo: boolean = true
) {
  const escapedTitle = escapeHtml(title);
  const escapedMessage = escapeHtml(message).replace(/\n/g, "<br>");
  const baseUrl = dashboardUrl.replace(/\/dashboard\/?$/, "") || "https://pushlog.ai";
  const logoSrc = useEmbeddedLogo ? "cid:pushlog-logo" : `${baseUrl}/PushLog.png`;

  const service = metadata?.service ?? "—";
  const environment = metadata?.environment ?? "—";
  const severity = metadata?.severity ?? "Error";
  const viewUrl = metadata?.sourceUrl || dashboardUrl;
  const viewLabel = metadata?.sourceUrl ? "View in Sentry" : "View in Dashboard";
  const createdAt = metadata?.createdAt
    ? formatRelativeTime(metadata.createdAt)
    : "just now";
  const hasLocation = metadata?.route || metadata?.stackFrame || metadata?.requestUrl;
  const rawHasStacktrace = metadata?.stacktrace && metadata.stacktrace.length > 0;
  const stackTraceIsBundled = metadata?.stackTraceIsBundled === true;
  const hasRelatedCommits = Array.isArray(metadata?.relatedCommits) && metadata.relatedCommits.length > 0;
  const relatedCommits = metadata?.relatedCommits ?? [];
  const relevantAuthors = metadata?.relevantAuthors ?? [];
  const hasErrorMessage = metadata?.errorMessage != null && String(metadata.errorMessage).trim().length > 0;
  const errorMessageEscaped = hasErrorMessage ? escapeHtml(String(metadata!.errorMessage!).trim()).replace(/\n/g, "<br>") : "";
  const exceptionType = metadata?.exceptionType != null ? escapeHtml(String(metadata.exceptionType)) : "";

  const isNoiseFrame = (file: string) =>
    /^log$/i.test(file) || /^test$/i.test(file) || /^\d{1,2}\/\w{3}\/\d{4}/.test(file) || /^\d{4}-\d{2}-\d{2}/.test(file) || /^<\w+>$/.test(file);

  const filteredFrames = rawHasStacktrace ? metadata!.stacktrace!.filter((f) => f.file && !isNoiseFrame(f.file)) : [];
  const hasStacktrace = filteredFrames.length > 0;

  const stackTraceHtml = hasStacktrace
    ? filteredFrames
        .map((f) => {
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
      <!-- Logo (embedded via cid: for Outlook compatibility) -->
      <div style="text-align: center; padding: 20px 24px 0;">
        <img src="${logoSrc}" alt="PushLog" width="48" height="48" style="display: block; margin: 0 auto; max-width: 48px; height: auto;" />
      </div>
      <!-- Header -->
      <div style="padding: 24px 24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 46px; padding-right: 18px; vertical-align: middle;">
              <div style="width: 28px; height: 28px; border-radius: 14px; background: #dc3545; text-align: center; line-height: 28px; font-size: 16px; font-weight: bold; color: white;">!</div>
            </td>
            <td style="vertical-align: middle;">
              <h1 style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #e8ece9;">Notification Details</h1>
              <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #e8ece9;">${escapedTitle}</p>
              <p style="margin: 0; font-size: 14px; color: #9ca3a8;">${escapedMessage}</p>
            </td>
          </tr>
        </table>
      </div>

      <!-- Incident details card -->
      <div style="margin: 0 16px 16px; padding: 20px; background: rgba(45, 61, 53, 0.5); border: 1px solid #2d3d35; border-radius: 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tr>
            <td style="width: 36px; padding-right: 14px; vertical-align: middle;">
              <div style="width: 20px; height: 20px; border-radius: 10px; background: #dc3545; text-align: center; line-height: 20px; font-size: 12px; font-weight: bold; color: white;">!</div>
            </td>
            <td style="vertical-align: middle;">
              <span style="font-size: 14px; font-weight: 600; color: #e8ece9;">Incident details</span>
            </td>
          </tr>
        </table>
        <p style="margin: 0 0 16px; font-size: 13px; color: #9ca3a8;">${escapedMessage}</p>

        ${hasErrorMessage ? `
        <!-- ERROR MESSAGE (actual error that triggered the incident) -->
        <div style="margin-bottom: 16px;">
          <div style="font-size: 11px; font-weight: 600; color: #6b7c74; letter-spacing: 0.5px; margin-bottom: 8px;">ERROR MESSAGE</div>
          <div style="padding: 12px; background: #2d1f1f; border-radius: 6px; font-family: 'Monaco', 'Menlo', monospace; font-size: 13px; color: #f0a0a0; line-height: 1.6; border: 1px solid #4a3535;">${exceptionType ? `<span style="color: #e8a74c;">${exceptionType}</span>: ` : ""}${errorMessageEscaped}</div>
        </div>
        ` : ""}

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
          ${stackTraceIsBundled ? `<div style="font-size: 12px; color: #e8a74c; margin-bottom: 10px; padding: 8px 12px; background: rgba(232,167,76,0.1); border-radius: 6px; border: 1px solid rgba(232,167,76,0.3);">This stack trace is from your bundled/minified build. Upload source maps to Sentry (Project &rarr; Settings &rarr; Source Maps) so Sentry can show original file names and lines. Then re-deploy with a matching release.</div>` : ""}
          <div style="font-size: 11px; font-weight: 600; color: #6b7c74; letter-spacing: 0.5px; margin-bottom: 8px;">STACK TRACE</div>
          <div style="padding: 12px; background: #141a18; border-radius: 6px; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; color: #9ca3a8; line-height: 1.7; border: 1px solid #2d3d35;">${stackTraceHtml}</div>
        </div>
        ` : ""}

        ${hasRelatedCommits ? `
        <!-- CORRELATED COMMITS -->
        <div style="margin-top: 16px; padding: 14px; background: rgba(125,211,160,0.05); border-radius: 8px; border: 1px solid rgba(125,211,160,0.25);">
          <div style="font-size: 11px; font-weight: 600; color: #7dd3a0; letter-spacing: 0.5px; margin-bottom: 4px;">CORRELATED COMMITS</div>
          ${metadata?.correlatedFile ? `
          <div style="font-size: 12px; color: #9ca3a8; margin-bottom: 10px;">
            Commits that changed <code style="background: #141a18; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 11px; color: #e8ece9;">${escapeHtml(String(metadata.correlatedFile))}${metadata?.correlatedLine ? `:${metadata.correlatedLine}` : ""}</code>
          </div>` : `
          <div style="font-size: 12px; color: #9ca3a8; margin-bottom: 10px;">Changes to the affected file</div>`}
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${relatedCommits.map((c) => `
              <div style="padding: 10px 12px; background: #141a18; border-radius: 6px; border-left: 3px solid ${c.touchesErrorLine ? "#ef4444" : "#7dd3a0"}; border-right: 1px solid #2d3d35; border-top: 1px solid #2d3d35; border-bottom: 1px solid #2d3d35;">
                <div>
                  <a href="${escapeHtml(c.htmlUrl)}" style="color: #7dd3a0; text-decoration: none; font-family: monospace; font-size: 12px;">${escapeHtml(c.shortSha)}</a>
                  <span style="color: #e8ece9; font-size: 13px; margin-left: 8px;">${escapeHtml(c.message)}</span>
                  ${c.touchesErrorLine ? `<span style="display: inline-block; margin-left: 6px; padding: 1px 6px; font-size: 10px; font-weight: 600; color: #ef4444; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 10px;">touches error line</span>` : ""}
                  ${!c.touchesErrorLine && typeof c.lineDistance === "number" && c.lineDistance <= 30 ? `<span style="display: inline-block; margin-left: 6px; padding: 1px 6px; font-size: 10px; font-weight: 600; color: #f59e0b; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 10px;">${c.lineDistance} lines away</span>` : ""}
                </div>
                <div style="font-size: 11px; color: #6b7c74; margin-top: 4px;">@${escapeHtml(c.author.login)}${c.timestamp ? ` · ${formatRelativeTime(c.timestamp)}` : ""}</div>
              </div>
            `).join("")}
          </div>
          ${relevantAuthors.length >= 2 ? `
          <div style="font-size: 11px; color: #6b7c74; margin-top: 10px;">Potentially relevant: ${relevantAuthors.map((a) => escapeHtml(a.login)).join(", ")}</div>
          ` : ""}
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
    <p style="margin: 8px 0 0; text-align: center; font-size: 11px; color: #6b7c74;">
      Please do not reply to this email. For questions, contact <a href="mailto:contact@pushlog.ai" style="color: #7dd3a0; text-decoration: none;">contact@pushlog.ai</a>.
    </p>
  </div>
</body>
</html>
    `,
  };
}
