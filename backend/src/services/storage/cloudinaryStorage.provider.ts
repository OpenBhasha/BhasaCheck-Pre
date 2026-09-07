import { deleteAudio, uploadAudioBuffer } from '../cloudinary.service';
import { AudioStorageProviderImpl, AudioStorageRef, AudioUploadInput } from './types';

export class CloudinaryStorageProvider implements AudioStorageProviderImpl {
  readonly name = 'cloudinary' as const;

  async upload({ buffer, folder }: AudioUploadInput): Promise<AudioStorageRef> {
    const result = await uploadAudioBuffer(buffer, { folder: `rsml/${folder}` });
    return { provider: 'cloudinary', url: result.secure_url, publicId: result.public_id };
  }

  async delete(ref: Pick<AudioStorageRef, 'publicId'>): Promise<void> {
    await deleteAudio(ref.publicId);
  }
}
