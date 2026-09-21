import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface RateLimitDocument extends Document {
  key: string;
  count: number;
  expiresAt: Date;
}

const RateLimitSchema = new Schema<RateLimitDocument>({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export const RateLimit: Model<RateLimitDocument> =
  mongoose.models.RateLimit || mongoose.model<RateLimitDocument>('RateLimit', RateLimitSchema);
