import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface OtpDocument extends Document {
  email: string;
  code: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OtpSchema = new Schema<OtpDocument>(
  {
    email: { type: String, required: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const Otp: Model<OtpDocument> =
  mongoose.models.Otp || mongoose.model<OtpDocument>('Otp', OtpSchema);
