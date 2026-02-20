export function getPasswordResetTemplate(resetLink: string, baseUrl?: string, useEmbeddedLogo: boolean = false) {
  const base = (baseUrl || "https://pushlog.ai").replace(/\/$/, "");
  const logoSrc = useEmbeddedLogo ? "cid:pushlog-logo" : `${base}/PushLog.png`;
  return {
    subject: 'Reset your PushLog password',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset your PushLog password</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 28px;">
              <img src="${logoSrc}" alt="PushLog" width="48" height="48" style="display: block; margin: 0 auto; max-width: 48px; height: auto;" />
            </div>
              <h1 style="color: #4CAF50; margin-bottom: 20px; text-align: center;">Reset Your PushLog Password</h1>
              
              <p style="margin-bottom: 20px; color: #333333;">You requested to reset your password. Click the button below to set a new password:</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetLink}" 
                   style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">
                  Reset Password
                </a>
              </div>
              
              <p style="margin-bottom: 20px; color: #666666;">
                If you didn't request this, you can safely ignore this email.
              </p>

              <p style="margin-bottom: 20px; color: #666666;">
                This link will expire in 24 hours.
              </p>
              
              <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999999;">
                <p style="margin-bottom: 10px; font-size: 12px;">
                  PushLog - Seamlessly connect GitHub with Slack
                </p>
                <p style="margin: 0; font-size: 11px;">
                  Please do not reply to this email. For questions, contact <a href="mailto:contact@pushlog.ai" style="color: #4CAF50; text-decoration: none;">contact@pushlog.ai</a>.
                </p>
              </div>
            </div>
          </body>
        </html>
      `
    };
}