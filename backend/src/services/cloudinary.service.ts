import { UploadApiResponse } from 'cloudinary';
import { cloudinary } from '../config/cloudinary';

export function uploadAudioBuffer(buffer: Buffer, options: { folder: string; publicId?: string }): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video', // Cloudinary uses the "video" resource type for audio files
        folder: options.folder,
        public_id: options.publicId,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload failed with no result'));
          return;
        }
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

export function deleteAudio(publicId: string): Promise<unknown> {
  return cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
}
