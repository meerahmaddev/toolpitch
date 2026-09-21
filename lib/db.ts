import dns from 'dns';
import mongoose from 'mongoose';

// The Atlas connection string resolves via a DNS SRV lookup. If the OS's
// configured DNS server is slow/unreachable (seen in the wild - a flaky
// ISP/router resolver), that SRV query can hang or fail even though every
// other DNS server would answer it fine. Forcing a couple of well-known
// public resolvers here means a bad primary OS resolver doesn't take the
// whole app down with an unhandled `querySrv ECONNREFUSED`.
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/convertify';

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cache;

export async function connectToDatabase(): Promise<typeof mongoose> {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  } catch {}

  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false, serverSelectionTimeoutMS: 15000 });
  }

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }

  return cache.conn;
}
