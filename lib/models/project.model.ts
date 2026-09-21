import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface ProjectDocument extends Document {
  name: string;
  userEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<ProjectDocument>(
  {
    name: { type: String, required: true },
    userEmail: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

export const Project: Model<ProjectDocument> =
  mongoose.models.Project || mongoose.model<ProjectDocument>('Project', ProjectSchema);
