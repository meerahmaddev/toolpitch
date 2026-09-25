import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { RateLimit } from '@/lib/models/rateLimit.model';

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  // Present when Cloudflare sits in front of the app; checked last since
  // x-forwarded-for (set by Vercel's own proxy) is the more common case.
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();

  // No proxy header at all means every client sharing this fallback gets bucketed
  // into one shared rate-limit counter - i.e. the whole site effectively shares
  // CONVERSION_LIMIT requests per window instead of each visitor getting their own.
  // That's only expected for direct/local requests; in a real deployment it means
  // the reverse proxy in front of this app isn't forwarding a client IP, which is
  // worth fixing rather than silently limiting everyone together.
  console.warn('getClientIp: no x-forwarded-for/x-real-ip/cf-connecting-ip header present - falling back to a shared "unknown" rate-limit bucket for all such requests.');
  return 'unknown';
}

/**
 * Fixed-window counter backed by Mongo. Each window is its own document keyed
 * by `${key}:${windowIndex}`, so it resets automatically each window and is
 * cleaned up by the TTL index on `expiresAt` — no separate reset job needed.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
  await connectToDatabase();

  const windowIndex = Math.floor(Date.now() / 1000 / windowSeconds);
  const windowKey = `${key}:${windowIndex}`;

  const record = await RateLimit.findOneAndUpdate(
    { key: windowKey },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(Date.now() + windowSeconds * 1000 + 5000) },
    },
    { upsert: true, returnDocument: 'after' }
  );

  const allowed = record.count <= limit;
  const windowEndsAt = (windowIndex + 1) * windowSeconds;
  const resetSeconds = Math.max(1, Math.ceil(windowEndsAt - Date.now() / 1000));
  return { allowed, remaining: Math.max(0, limit - record.count), resetSeconds };
}

/**
 * Convenience wrapper matching the requireSessionUser idiom: call it at the
 * top of a route, and early-return if it returns a NextResponse.
 * Usage: `const limited = await rateLimitOrThrow(request, {...}); if (limited) return limited;`
 */
export async function rateLimitOrThrow(
  request: Request,
  opts: { keyPrefix: string; limit: number; windowSeconds: number; identifier?: string }
): Promise<NextResponse | null> {
  const identifier = opts.identifier || getClientIp(request);

  let allowed: boolean;
  let remaining = 0;
  let resetSeconds = opts.windowSeconds;
  try {
    ({ allowed, remaining, resetSeconds } = await checkRateLimit(`${opts.keyPrefix}:${identifier}`, opts.limit, opts.windowSeconds));
  } catch (error) {
    // Rate limiting is backed by Mongo; a DB/DNS outage here shouldn't take
    // down every conversion tool. Fail open (allow the request) and log -
    // an unavailable rate limiter is a lesser problem than the whole app 500ing.
    console.error('rateLimitOrThrow: checkRateLimit failed, failing open:', error);
    return null;
  }

  if (!allowed) {
    return NextResponse.json(
      { message: `Too many requests. Limit is ${opts.limit} per ${opts.windowSeconds}s - try again in ${resetSeconds}s.` },
      {
        status: 429,
        headers: {
          'Retry-After': String(resetSeconds),
          'X-RateLimit-Limit': String(opts.limit),
          'X-RateLimit-Remaining': String(remaining),
        },
      }
    );
  }
  return null;
}

/**
 * Shared quota across every conversion-type endpoint (compress, merge, split,
 * edit, process, speech, etc.) - one identifier (IP, or user id if passed) gets
 * CONVERSION_LIMIT conversions per CONVERSION_WINDOW_SECONDS in total, not per
 * endpoint. Upload/preview/download routes stay on their own separate, looser
 * limits since they aren't the expensive conversion step itself.
 */
const CONVERSION_LIMIT = 2;
const CONVERSION_WINDOW_SECONDS = 60;

export async function enforceConversionLimit(request: Request, identifier?: string): Promise<NextResponse | null> {
  return rateLimitOrThrow(request, {
    keyPrefix: 'conversion',
    limit: CONVERSION_LIMIT,
    windowSeconds: CONVERSION_WINDOW_SECONDS,
    identifier,
  });
}
