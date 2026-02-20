function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function getIncidentAlertEmailTemplate(
  title: string,
  message: string,
  dashboardUrl: string
) {
  const escapedTitle = escapeHtml(title);
  const escapedMessage = escapeHtml(message).replace(/\n/g, "<br>");
  const baseUrl = dashboardUrl.replace(/\/dashboard\/?$/, "") || "https://pushlog.ai";
  const logoUrl = `${baseUrl}/PushLog.png`;

  return {
    subject: `[PushLog] ${title}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Incident Alert - PushLog</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 28px;">
              <img src="${logoUrl}" alt="PushLog" width="48" height="48" style="display: inline-block; object-fit: contain;" />
            </div>

            <h1 style="color: #4CAF50; margin-bottom: 8px; text-align: center; font-size: 22px;">Incident Alert</h1>
            <p style="color: #999999; text-align: center; margin-bottom: 24px; font-size: 14px;">PushLog has detected an issue that may need your attention</p>

            <h2 style="color: #333333; font-size: 18px; margin-bottom: 12px;">${escapedTitle}</h2>
            <p style="margin-bottom: 24px; color: #555555;">${escapedMessage}</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${dashboardUrl}"
                 style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">
                View in PushLog Dashboard
              </a>
            </div>

            <p style="margin-bottom: 20px; color: #666666; font-size: 14px;">
              This alert was sent because you're configured to receive incident notifications for your PushLog account.
            </p>

            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999999;">
              <p style="margin-bottom: 10px; font-size: 12px;">
                PushLog - Seamlessly connect GitHub with Slack
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
  };
}
