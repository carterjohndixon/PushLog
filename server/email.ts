import nodemailer from 'nodemailer';
import { z } from 'zod';
import { getVerificationEmailTemplate } from './templates/verificationEmail';
import { getPasswordResetTemplate } from './templates/passwordReset';
import { getIncidentAlertEmailTemplate } from './templates/incidentAlertEmail';

// Email configuration schema
const emailConfigSchema = z.object({
  host: z.string().default('smtp-relay.brevo.com'),
  port: z.number().default(587),
  auth: z.object({
    user: z.string(),
    pass: z.string()
  })
});

// Create transporter once
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

function isEmailEnabled(): boolean {
  return process.env.EMAIL_ENABLED !== 'false';
}

export async function sendVerificationEmail(email: string, token: string) {
  if (!isEmailEnabled()) {
    console.log("Email disabled by EMAIL_ENABLED=false. Skipping verification email.");
    return;
  }
  const verificationLink = `${process.env.APP_URL}/verify-email?token=${token}`;
  
  const { subject, html } = getVerificationEmailTemplate(verificationLink);
  
  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@pushlog.ai',
    to: email,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Failed to send verification email:', error);
    throw new Error('Failed to send verification email');
  }
}

// Add sendPasswordResetEmail function
export const sendPasswordResetEmail = async (email: string, resetToken: string) => {
  if (!isEmailEnabled()) {
    console.log("Email disabled by EMAIL_ENABLED=false. Skipping password reset email.");
    return;
  }
  const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
  const { subject, html } = getPasswordResetTemplate(resetLink);

  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@pushlog.ai',
    to: email,
    subject,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Failed to send reset password email:', error);
    throw new Error('Failed to send reset password  email');
  }
};

/** Send incident alert email (Sentry webhook, incident-engine). Fire-and-forget; logs on failure. */
export async function sendIncidentAlertEmail(
  email: string,
  title: string,
  message: string
): Promise<void> {
  if (!isEmailEnabled()) {
    return;
  }
  const dashboardUrl = (process.env.APP_URL || 'https://pushlog.ai').replace(/\/$/, '') + '/dashboard';
  const { subject, html } = getIncidentAlertEmailTemplate(title, message, dashboardUrl);

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@pushlog.ai',
      to: email,
      subject,
      html,
    });
  } catch (error) {
    console.error('[email] Failed to send incident alert:', error);
  }
} 