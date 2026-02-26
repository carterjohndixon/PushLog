export function getOrgInviteEmailTemplate(
  joinUrl: string,
  inviterName?: string,
  baseUrl?: string,
  useEmbeddedLogo: boolean = false
) {
  const base = (baseUrl || "https://pushlog.ai").replace(/\/$/, "");
  const logoSrc = useEmbeddedLogo ? "cid:pushlog-logo" : `${base}/PushLog.png`;
  const inviterLine = inviterName
    ? `<p style="margin-bottom: 20px; color: #333333;">${escapeHtml(inviterName)} has invited you to join their organization on PushLog.</p>`
    : "";
  return {
    subject: "You're invited to join an organization on PushLog",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Organization invite - PushLog</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 28px;">
              <img src="${logoSrc}" alt="PushLog" width="48" height="48" style="display: block; margin: 0 auto; max-width: 48px; height: auto;" />
            </div>
            <h1 style="color: #4CAF50; margin-bottom: 20px; text-align: center;">Organization invite</h1>
            ${inviterLine}
            <p style="margin-bottom: 20px; color: #333333;">Click the button below to accept the invite and join the organization. If you don't have a PushLog account yet, you'll be able to sign up.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${escapeHtml(joinUrl)}"
                 style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">
                Accept invite
              </a>
            </div>
            <p style="margin-bottom: 20px; color: #666666; font-size: 12px;">
              If you didn't expect this invite, you can safely ignore this email.
            </p>
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999999;">
              <p style="margin: 0; font-size: 11px;">PushLog - GitHub and Slack, connected.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
