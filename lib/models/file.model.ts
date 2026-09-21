import mongoose, { Schema, type Document, type Model, Types } from 'mongoose';

export interface FileDocument extends Document {
  originalName: string;
  filename: string;
  size: number;
  mimetype: string;
  userEmail: string;
  isStarred: boolean;
  isPinned: boolean;
  isDeleted: boolean;
  projectId: Types.ObjectId | null;
  cloudinaryPublicId: string;
  resourceType: string;
  isExpired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FileSchema = new Schema<FileDocument>(
  {
    originalName: { type: String, required: true },
    filename: { type: String, required: true },
    size: { type: Number, required: true },
    mimetype: { type: String, required: true },
    userEmail: { type: String, required: true, index: true },
    isStarred: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    cloudinaryPublicId: { type: String },
    resourceType: { type: String },
    isExpired: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const File: Model<FileDocument> =
  mongoose.models.File || mongoose.model<FileDocument>('File', FileSchema);
