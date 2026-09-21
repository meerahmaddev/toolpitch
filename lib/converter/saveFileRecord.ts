import { connectToDatabase } from '@/lib/db';
import { File, type FileDocument } from '@/lib/models/file.model';
import { uploadBufferToCloudinary } from '@/lib/cloudinary';

export async function uploadAndSaveFile(params: {
  buffer: Buffer;
  originalName: string;
  filename: string;
  size: number;
  mimetype: string;
  userEmail: string;
}): Promise<FileDocument> {
  await connectToDatabase();

  const cloudResult = await uploadBufferToCloudinary(params.buffer, params.originalName);

  const newFile = new File({
    originalName: params.originalName,
    filename: params.filename,
    size: params.size,
    mimetype: params.mimetype,
    cloudinaryPublicId: cloudResult.public_id,
    resourceType: cloudResult.resource_type,
    userEmail: params.userEmail,
  });
  await newFile.save();

  return newFile;
}

export function generateStoredFilename(originalName: string, prefix = 'file'): string {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const ext = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
  return `${prefix}-${uniqueSuffix}${ext}`;
}
