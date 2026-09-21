import jwt from 'jsonwebtoken';

const envSecret = process.env.JWT_SECRET;

if (!envSecret) {
  throw new Error('JWT_SECRET environment variable must be set');
}

const JWT_SECRET: string = envSecret;

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function signAuthTokens(payload: JwtPayload) {
  return {
    access_token: signAccessToken(payload),
    refresh_token: signRefreshToken(payload),
  };
}
