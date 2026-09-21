import { connectToDatabase } from '@/lib/db';
import { User, type UserDocument } from '@/lib/models/user.model';

export class UserAlreadyExistsError extends Error {
  constructor() {
    super('User already exists');
  }
}

// Emails are matched case-insensitively (RFC 5321 makes the local part
// case-sensitive in theory, but no mainstream provider treats it that way,
// and users expect "User@x.com" and "user@x.com" to be the same account).
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(
  email: string,
  passwordHash: string,
  fullName: string
): Promise<UserDocument> {
  await connectToDatabase();
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new UserAlreadyExistsError();
  }
  const newUser = new User({ email: normalizedEmail, passwordHash, fullName, isVerified: false });
  return newUser.save();
}

export async function findUserByEmail(email: string): Promise<UserDocument | null> {
  await connectToDatabase();
  return User.findOne({ email: normalizeEmail(email) });
}

export async function markUserAsVerified(email: string): Promise<void> {
  await connectToDatabase();
  await User.updateOne({ email: normalizeEmail(email) }, { isVerified: true });
}

export async function updateUserPassword(email: string, passwordHash: string): Promise<void> {
  await connectToDatabase();
  await User.updateOne({ email: normalizeEmail(email) }, { passwordHash });
}

export async function updateUserName(email: string, fullName: string): Promise<void> {
  await connectToDatabase();
  await User.updateOne({ email: normalizeEmail(email) }, { fullName });
}

export async function deleteUser(email: string): Promise<void> {
  await connectToDatabase();
  await User.deleteOne({ email: normalizeEmail(email) });
}
