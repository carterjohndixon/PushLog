import nodemailer from 'nodemailer';
import { z } from 'zod';
import { getVerificationEmailTemplate } from './templates/verificationEmail';
import { getPasswordResetTemplate } from './templates/passwordReset';

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

export async function sendVerificationEmail(email: string, token: string) {
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