function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Strip duplicate "Error: " (or similar) from the start of a string so we don't show "Error: Error: message". */
function stripDuplicateErrorPrefix(s: string): string {
  const t = s.trim();
  const m = t.match(/^(\w+):\s*(.+)$/);
  if (!m) return t;
  const [, prefix, rest] = m;
  const restTrim = rest.trim();
  if (restTrim.startsWith(prefix + ":") || restTrim.startsWith(prefix + ": ")) {
    return stripDuplicateErrorPrefix(restTrim);
  }
  return t;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  stackTraceIsBundled?: boolean;
  sourceUrl?: string;
  createdAt?: string;
  errorMessage?: string;
  exceptionType?: string;
  relatedCommits?: RelatedCommitForEmail[];
  relevantAuthors?: Array<{ login: string; name?: string | null }>;
  correlatedFile?: string;
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

// Solid hex colors only — rgba() is unreliable across email clients.
const C = {
  bodyBg: "#111614",
  cardBg: "#1b2721",
  innerBg: "#1b2b24",
  codeBg: "#141a18",
  border: "#2d3d35",
  title: "#e8ece9",
  body: "#c5ccc8",
  muted: "#8a9590",
  dim: "#6b7c74",
  green: "#7dd3a0",
  amber: "#e8a74c",
  red: "#ef4444",
  redBg: "#2d1f1f",
  redBorder: "#4a3535",
  redText: "#f0a0a0",
  commitGreenBg: "#152218",
  commitGreenBorder: "#2a4a37",
  badgeRedBg: "#2b1818",
  badgeRedBorder: "#5a2828",
  badgeAmberBg: "#2b2418",
  badgeAmberBorder: "#5a4a28",
};

export function getIncidentAlertEmailTemplate(
  title: string,
  message: string,
  dashboardUrl: string,
  metadata?: IncidentAlertMetadata,
  useEmbeddedLogo: boolean = true
) {
  const escapedTitle = escapeHtml(stripDuplicateErrorPrefix(title));
  const escapedMessage = escapeHtml(stripDuplicateErrorPrefix(message)).replace(/\n/g, "<br>");
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
  const rawExceptionType = metadata?.exceptionType != null ? String(metadata.exceptionType).trim() : "";
  const rawErrorMessage = hasErrorMessage ? String(metadata!.errorMessage!).trim() : "";
  const displayErrorMessage =
    rawErrorMessage && rawExceptionType
      ? rawErrorMessage.replace(new RegExp(`^${escapeRegex(rawExceptionType)}:\\s*`, "i"), "").trim() || rawErrorMessage
      : rawErrorMessage;
  const errorMessageEscaped = hasErrorMessage ? escapeHtml(displayErrorMessage).replace(/\n/g, "<br>") : "";
  const exceptionType = rawExceptionType ? escapeHtml(rawExceptionType) : "";

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
              ? `<span style="color: ${C.amber};">:${f.line}</span>`
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
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapedTitle} - PushLog</title>
  <!--[if mso]>
  <style>body,table,td{font-family:Arial,Helvetica,sans-serif!important;}</style>
  <![endif]-->
  <style>
    :root { color-scheme: dark; supported-color-schemes: dark; }
    body, .body-wrap { background-color: ${C.bodyBg} !important; }
    u + .body-wrap { /* Gmail hack */ }
    .body-wrap { width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    @media only screen and (max-width: 640px) {
      .email-container { padding: 12px !important; }
      .card-main { border-radius: 8px !important; }
      .card-inner { margin: 0 10px 10px !important; padding: 14px !important; }
      .header-td { padding: 16px 16px 12px !important; }
      .footer-td { padding: 12px 16px 16px !important; }
      .commit-row { padding: 8px 10px !important; }
    }
  </style>
</head>
<body class="body-wrap" style="margin: 0; padding: 0; background-color: ${C.bodyBg}; -webkit-font-smoothing: antialiased; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bodyBg}"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${C.bodyBg};">
    <tr>
      <td align="center" class="email-container" style="padding: 24px;">
        <table role="presentation" class="card-main" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: ${C.cardBg}; border-radius: 12px; border: 1px solid ${C.border};">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding: 20px 24px 0; background-color: ${C.cardBg};">
              <img src="${logoSrc}" alt="PushLog" width="48" height="48" style="display: block; max-width: 48px; height: auto; border: 0;" />
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td class="header-td" style="padding: 24px 24px 16px; background-color: ${C.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
                <tr>
                  <td width="46" style="padding-right: 18px; vertical-align: middle;">
                    <div style="width: 28px; height: 28px; border-radius: 14px; background-color: ${C.red}; text-align: center; line-height: 28px; font-size: 16px; font-weight: bold; color: #ffffff;">!</div>
                  </td>
                  <td style="vertical-align: middle;">
                    <p style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: ${C.title};">Notification Details</p>
                    <p style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: ${C.title};">${escapedTitle}</p>
                    <p style="margin: 0; font-size: 14px; color: ${C.body}; line-height: 1.5;">${escapedMessage}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Incident details card — single-cell layout to prevent inter-row gaps in email clients -->
          <tr>
            <td class="card-inner" style="padding: 0 16px 16px; background-color: ${C.cardBg};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: ${C.innerBg}; border: 1px solid ${C.border}; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">

                    <!-- Incident details heading -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-bottom: 16px;">
                      <tr>
                        <td width="36" style="padding-right: 14px; vertical-align: middle;">
                          <div style="width: 20px; height: 20px; border-radius: 10px; background-color: ${C.red}; text-align: center; line-height: 20px; font-size: 12px; font-weight: bold; color: #ffffff;">!</div>
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="font-size: 14px; font-weight: 600; color: ${C.title};">Incident details</span>
                        </td>
                      </tr>
                    </table>

                    ${hasErrorMessage ? `
                    <!-- ERROR MESSAGE -->
                    <div style="margin-bottom: 16px;">
                      <div style="font-size: 11px; font-weight: 600; color: ${C.dim}; letter-spacing: 0.5px; margin-bottom: 8px;">ERROR MESSAGE</div>
                      <div style="padding: 12px; background-color: ${C.redBg}; border-radius: 6px; font-family: 'Monaco', 'Menlo', 'Courier New', monospace; font-size: 13px; color: ${C.redText}; line-height: 1.6; border: 1px solid ${C.redBorder}; word-break: break-word; overflow-wrap: break-word;">${exceptionType ? `<span style="color: ${C.amber};">${exceptionType}</span>: ` : ""}${errorMessageEscaped}</div>
                    </div>
                    ` : ""}

                    ${hasLocation ? `
                    <!-- LOCATION -->
                    <div style="margin-bottom: 16px;">
                      <div style="font-size: 11px; font-weight: 600; color: ${C.dim}; letter-spacing: 0.5px; margin-bottom: 8px;">LOCATION</div>
                      ${metadata?.route ? `<div style="margin-bottom: 6px;"><span style="display: inline-block; padding: 4px 8px; background-color: ${C.border}; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 13px; color: ${C.green};">${escapeHtml(metadata.route)}</span></div>` : ""}
                      ${metadata?.stackFrame ? `<div style="margin-bottom: 6px;"><span style="display: inline-block; padding: 4px 8px; background-color: ${C.border}; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 13px; color: ${C.green};">${escapeHtml(metadata.stackFrame)}</span></div>` : ""}
                      ${metadata?.requestUrl ? `<div style="font-size: 13px;"><a href="${escapeHtml(metadata.requestUrl)}" style="color: ${C.green}; text-decoration: none;">${escapeHtml(metadata.requestUrl)}</a></div>` : ""}
                    </div>
                    ` : ""}

                    <!-- SUMMARY -->
                    <div style="margin-bottom: ${hasStacktrace || hasRelatedCommits ? "16px" : "0"};">
                      <div style="font-size: 11px; font-weight: 600; color: ${C.dim}; letter-spacing: 0.5px; margin-bottom: 8px;">SUMMARY</div>
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
                        <tr>
                          <td style="font-size: 13px; color: ${C.title}; padding-bottom: 4px;"><strong>Service:</strong> <span style="color: ${C.body};">${escapeHtml(String(service))}</span></td>
                        </tr>
                        <tr>
                          <td style="font-size: 13px; color: ${C.title}; padding-bottom: 4px;"><strong>Environment:</strong> <span style="color: ${C.body};">${escapeHtml(String(environment))}</span></td>
                        </tr>
                        <tr>
                          <td style="font-size: 13px; color: ${C.title};"><strong>Severity:</strong> <span style="color: ${C.body};">${escapeHtml(String(severity))}</span></td>
                        </tr>
                      </table>
                    </div>

                    ${hasStacktrace ? `
                    <!-- STACK TRACE -->
                    <div style="margin-bottom: ${hasRelatedCommits ? "16px" : "0"};">
                      ${stackTraceIsBundled ? `<div style="font-size: 12px; color: ${C.amber}; margin-bottom: 10px; padding: 8px 12px; background-color: #2b2418; border-radius: 6px; border: 1px solid #4a3d28;">This stack trace is from your bundled/minified build. Upload source maps to Sentry (Project &rarr; Settings &rarr; Source Maps) so Sentry can show original file names and lines.</div>` : ""}
                      <div style="font-size: 11px; font-weight: 600; color: ${C.dim}; letter-spacing: 0.5px; margin-bottom: 8px;">STACK TRACE</div>
                      <div style="padding: 12px; background-color: ${C.codeBg}; border-radius: 6px; font-family: 'Monaco', 'Menlo', 'Courier New', monospace; font-size: 12px; color: ${C.muted}; line-height: 1.7; border: 1px solid ${C.border}; word-break: break-word; overflow-wrap: break-word;">${stackTraceHtml}</div>
                    </div>
                    ` : ""}

                    ${hasRelatedCommits ? `
                    <!-- CORRELATED COMMITS -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: ${C.commitGreenBg}; border-radius: 8px; border: 1px solid ${C.commitGreenBorder};">
                      <tr>
                        <td style="padding: 14px;">
                          <div style="font-size: 11px; font-weight: 600; color: ${C.green}; letter-spacing: 0.5px; margin-bottom: 4px;">CORRELATED COMMITS</div>
                          ${metadata?.correlatedFile ? `
                          <div style="font-size: 12px; color: ${C.muted}; margin-bottom: 12px;">
                            ${metadata?.correlatedLine != null ? "Commits that added a line at " : "Commits touching "}
                            <code style="background-color: ${C.codeBg}; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 11px; color: ${C.title};">${escapeHtml(String(metadata.correlatedFile))}${metadata?.correlatedLine ? `:${metadata.correlatedLine}` : ""}</code>${metadata?.correlatedLine != null ? " in this file" : ""}
                          </div>` : `
                          <div style="font-size: 12px; color: ${C.muted}; margin-bottom: 12px;">Changes to the affected file</div>`}
                          ${relatedCommits.map((c) => `
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-bottom: 8px;">
                            <tr>
                              <td class="commit-row" style="padding: 10px 12px; background-color: ${C.codeBg}; border-radius: 6px; border-left: 3px solid ${c.touchesErrorLine ? C.red : C.green}; border-right: 1px solid ${C.border}; border-top: 1px solid ${C.border}; border-bottom: 1px solid ${C.border};">
                                <div>
                                  <a href="${escapeHtml(c.htmlUrl)}" style="color: ${C.green}; text-decoration: none; font-family: 'Courier New', monospace; font-size: 12px;">${escapeHtml(c.shortSha)}</a>
                                  <span style="color: ${C.title}; font-size: 13px; margin-left: 8px;">${escapeHtml(c.message)}</span>
                                  ${c.touchesErrorLine ? `<span style="display: inline-block; margin-left: 6px; padding: 1px 6px; font-size: 10px; font-weight: 600; color: ${C.red}; background-color: ${C.badgeRedBg}; border: 1px solid ${C.badgeRedBorder}; border-radius: 10px;">added this line</span>` : ""}
                                  ${!c.touchesErrorLine && typeof c.lineDistance === "number" && c.lineDistance <= 30 ? `<span style="display: inline-block; margin-left: 6px; padding: 1px 6px; font-size: 10px; font-weight: 600; color: #f59e0b; background-color: ${C.badgeAmberBg}; border: 1px solid ${C.badgeAmberBorder}; border-radius: 10px;">${c.lineDistance} lines away</span>` : ""}
                                </div>
                                <div style="font-size: 11px; color: ${C.dim}; margin-top: 4px;">@${escapeHtml(c.author.login)}${c.timestamp ? ` &middot; ${formatRelativeTime(c.timestamp)}` : ""}</div>
                              </td>
                            </tr>
                          </table>
                          `).join("")}
                          ${relevantAuthors.length >= 2 ? `
                          <div style="font-size: 11px; color: ${C.dim}; margin-top: 4px;">Potentially relevant: ${relevantAuthors.map((a) => escapeHtml(a.login)).join(", ")}</div>
                          ` : ""}
                        </td>
                      </tr>
                    </table>
                    ` : ""}

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="footer-td" style="padding: 16px 24px 24px; border-top: 1px solid ${C.border}; background-color: ${C.cardBg};">
              <a href="${escapeHtml(viewUrl)}" style="display: inline-block; padding: 10px 20px; background-color: ${C.green}; color: ${C.bodyBg}; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px; margin-bottom: 12px;">
                ${escapeHtml(viewLabel)} &rarr;
              </a>
              <div style="font-size: 12px; color: ${C.dim}; margin-top: 8px;">
                <strong style="color: ${C.muted};">Type:</strong> incident alert &nbsp;&middot;&nbsp;
                <strong style="color: ${C.muted};">Created:</strong> ${escapeHtml(createdAt)}
              </div>
            </td>
          </tr>

        </table>

        <!-- Below-card branding -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px;">
          <tr>
            <td align="center" style="padding: 16px 0 0;">
              <p style="margin: 0; font-size: 12px; color: ${C.dim};">PushLog &mdash; Seamlessly connect GitHub with Slack</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 8px 0 0;">
              <p style="margin: 0; font-size: 11px; color: ${C.dim};">
                Please do not reply to this email. For questions, contact <a href="mailto:contact@pushlog.ai" style="color: ${C.green}; text-decoration: none;">contact@pushlog.ai</a>.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>
    `,
  };
}
