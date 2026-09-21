import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  if (process.env.NODE_ENV !== 'production' || !process.env.SMTP_USER) {
    // Local dev (or no SMTP configured yet): print the OTP instead of emailing it.
    // Never do this in production - it would leak every user's OTP into server logs.
    console.log(`\n============================\n[DEV MODE] OTP FOR ${to}: ${otp}\n============================\n`);
    if (!process.env.SMTP_USER) return;
  }

  try {
    // Gmail (and most SMTP relays) reject or silently rewrite a "from" address
    // that doesn't match the authenticated SMTP_USER, so it has to be that
    // account rather than a made-up domain.
    const info = await getTransporter().sendMail({
      from: `"Convertify Security" <${process.env.SMTP_USER}>`,
      to,
      subject: 'Your Convertify Verification Code',
      text: `Your verification code is: ${otp}`,
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
          <h2 style="color: #683bbd;">Convertify Verification</h2>
          <p>Please use the following 4-digit code to verify your account.</p>
          <div style="margin: 20px auto; padding: 15px; background: #f3f4f6; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1f2937;">
            ${otp}
          </div>
          <p style="color: #6b7280; font-size: 14px;">This code will expire in 10 minutes.</p>
        </div>
      `,
    });
    console.log(`Message sent: ${info.messageId}`);
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error instanceof Error ? error.message : error);
  }
}
