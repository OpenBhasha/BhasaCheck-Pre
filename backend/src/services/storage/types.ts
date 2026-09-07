import { AudioStorageProvider } from '../../types';

export interface AudioStorageRef {
  provider: AudioStorageProvider;
  url: string;
  publicId: string;
}

export interface AudioUploadInput {
  buffer: Buffer;
  /** Logical grouping, e.g. `projects/<id>/audio` or `processed/<taskId>`. */
  folder: string;
  /** Original filename — only its extension is used, to name the stored file. */
  filename: string;
}

/**
 * Storage backend for audio bytes. `MusicRemovalService`-style abstraction:
 * callers (upload endpoint, task deletion, the ML pipeline's processed-audio
 * callback) only ever talk to this interface, never to Cloudinary or the
 * filesystem directly, so a new backend (S3, GCS, ...) is a third
 * implementation away.
 */
export interface AudioStorageProviderImpl {
  readonly name: AudioStorageProvider;
  upload(input: AudioUploadInput): Promise<AudioStorageRef>;
  delete(ref: Pick<AudioStorageRef, 'publicId'>): Promise<void>;
}
