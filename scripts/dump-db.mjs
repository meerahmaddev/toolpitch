import dns from 'dns';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

function loadMongoUri() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== 'MONGODB_URI') continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  }
  throw new Error('MONGODB_URI not found in .env.local');
}

function toPlain(value) {
  if (value == null) return value;
  if (typeof value.toJSON === 'function') return value.toJSON();
  if (Array.isArray(value)) return value.map(toPlain);
  if (Buffer.isBuffer(value)) return { $binary: value.toString('base64') };
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

const uri = loadMongoUri();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(process.env.USERPROFILE, 'Desktop', `convertify-db-dump-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000, bufferCommands: false });
const db = mongoose.connection.db;
if (!db) throw new Error('Mongo connection has no database handle');

const collections = await db.listCollections().toArray();
const summary = [];

for (const { name } of collections) {
  const docs = await db.collection(name).find({}).toArray();
  const file = path.join(outDir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(docs.map(toPlain), null, 2), 'utf8');
  summary.push({ collection: name, documents: docs.length });
}

await mongoose.disconnect();

const manifest = {
  database: db.databaseName,
  dumpedAt: new Date().toISOString(),
  collections: summary,
};
fs.writeFileSync(path.join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(JSON.stringify({ outDir, ...manifest }, null, 2));
