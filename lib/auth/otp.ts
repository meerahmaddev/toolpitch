import { connectToDatabase } from '@/lib/db';
import { Otp } from '@/lib/models/otp.model';
import { sendOtpEmail } from '@/lib/mailer';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function generateAndSendOtp(email: string): Promise<void> {
  await connectToDatabase();
  const normalizedEmail = normalizeEmail(email);

  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

  await Otp.deleteMany({ email: normalizedEmail });

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  await Otp.create({ email: normalizedEmail, code: otpCode, expiresAt });

  await sendOtpEmail(normalizedEmail, otpCode);
}

export class InvalidOtpError extends Error {
  constructor(message = 'Invalid OTP') {
    super(message);
  }
}

export class ExpiredOtpError extends Error {
  constructor() {
    super('OTP has expired');
  }
}

export async function assertValidOtp(email: string, code: string): Promise<void> {
  await connectToDatabase();
  const otpRecord = await Otp.findOne({ email: normalizeEmail(email), code });
  if (!otpRecord) {
    throw new InvalidOtpError();
  }
  if (otpRecord.expiresAt < new Date()) {
    throw new ExpiredOtpError();
  }
}

export async function clearOtp(email: string): Promise<void> {
  await connectToDatabase();
  await Otp.deleteMany({ email: normalizeEmail(email) });
}
