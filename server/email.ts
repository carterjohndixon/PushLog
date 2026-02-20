import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { getVerificationEmailTemplate } from './templates/verificationEmail';
import { getPasswordResetTemplate } from './templates/passwordReset';
import {
  getIncidentAlertEmailTemplate,
  type IncidentAlertMetadata,
} from './templates/incidentAlertEmail';

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

/** Format "from" for display: PushLog <no-reply@pushlog.ai>. Use SMTP_FROM if set (plain email gets "PushLog" prefix). */
function getFromAddress(): string {
  const addr = process.env.SMTP_FROM || 'no-reply@pushlog.ai';
  return addr.includes('<') ? addr : `PushLog <${addr}>`;
}

export async function sendVerificationEmail(email: string, token: string) {
  if (!isEmailEnabled()) {
    console.log("Email disabled by EMAIL_ENABLED=false. Skipping verification email.");
    return;
  }
  const baseUrl = (process.env.APP_URL || "https://pushlog.ai").replace(/\/$/, "");
  const verificationLink = `${baseUrl}/verify-email?token=${token}`;
  const logoPath = getLogoPath();
  const useEmbeddedLogo = !!logoPath;
  const { subject, html } = getVerificationEmailTemplate(verificationLink, baseUrl, useEmbeddedLogo);
  const attachments = logoPath
    ? [{ filename: 'PushLog.png', content: fs.readFileSync(logoPath), cid: 'pushlog-logo' }]
    : [];

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to: email,
      subject,
      html,
      attachments,
    });
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
  const baseUrl = (process.env.APP_URL || "https://pushlog.ai").replace(/\/$/, "");
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
  const logoPath = getLogoPath();
  const useEmbeddedLogo = !!logoPath;
  const { subject, html } = getPasswordResetTemplate(resetLink, baseUrl, useEmbeddedLogo);
  const attachments = logoPath
    ? [{ filename: 'PushLog.png', content: fs.readFileSync(logoPath), cid: 'pushlog-logo' }]
    : [];

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to: email,
      subject,
      html,
      attachments,
    });
  } catch (error) {
    console.error('Failed to send reset password email:', error);
    throw new Error('Failed to send reset password  email');
  }
};

/** Resolve logo path (dist/public in prod, client/public in dev). Returns null if not found. */
function getLogoPath(): string | null {
  const root = path.join(__dirname, '..');
  const candidates = [
    path.join(root, 'dist', 'public', 'PushLog.png'),
    path.join(root, 'client', 'public', 'PushLog.png'),
    path.join(root, 'public', 'PushLog.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Send incident alert email (Sentry webhook, incident-engine). Fire-and-forget; logs on failure. */
export async function sendIncidentAlertEmail(
  email: string,
  title: string,
  message: string,
  metadata?: IncidentAlertMetadata
): Promise<void> {
  if (!isEmailEnabled()) {
    return;
  }
  const dashboardUrl = (process.env.APP_URL || 'https://pushlog.ai').replace(/\/$/, '') + '/dashboard';
  const logoPath = getLogoPath();
  const useEmbeddedLogo = !!logoPath;
  const { subject, html } = getIncidentAlertEmailTemplate(title, message, dashboardUrl, metadata, useEmbeddedLogo);

  const attachments = logoPath
    ? [{ filename: 'PushLog.png', content: fs.readFileSync(logoPath), cid: 'pushlog-logo' }]
    : [];

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to: email,
      subject,
      html,
      attachments,
    });
  } catch (error) {
    console.error('[email] Failed to send incident alert:', error);
  }
} 