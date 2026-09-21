import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  originalName: string
): Promise<UploadApiResponse> {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw', // acts as a dumb storage bucket, bypasses strict PDF/ZIP ACLs
        type: 'authenticated', // secure, private upload
        use_filename: true,
        unique_filename: true,
        filename_override: originalName,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result as UploadApiResponse);
      }
    );
    uploadStream.end(buffer);
  });
}

export function generateSignedUrl(
  publicId: string,
  resourceType: string = 'image'
): string {
  const options = {
    resource_type: resourceType,
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiration
  };
  return cloudinary.utils.private_download_url(publicId, '', options);
}

export async function deleteCloudinaryFile(publicId: string, resourceType: string = 'image') {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(
      publicId,
      { type: 'authenticated', resource_type: resourceType },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
}
