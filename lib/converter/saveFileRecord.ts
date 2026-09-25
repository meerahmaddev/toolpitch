import fs from 'fs';
import path from 'path';
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

  let cloudinaryPublicId = '';
  let resourceType = 'raw';

  const hasCloudinary = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );

  if (hasCloudinary) {
    const cloudResult = await uploadBufferToCloudinary(params.buffer, params.originalName);
    cloudinaryPublicId = cloudResult.public_id;
    resourceType = cloudResult.resource_type;
  } else {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const localFilePath = path.join(uploadDir, params.filename);
    await fs.promises.writeFile(localFilePath, params.buffer);
    cloudinaryPublicId = `local:${params.filename}`;
  }

  const newFile = new File({
    originalName: params.originalName,
    filename: params.filename,
    size: params.size,
    mimetype: params.mimetype,
    cloudinaryPublicId,
    resourceType,
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
