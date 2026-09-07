import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AudioStorageProviderImpl, AudioStorageRef, AudioUploadInput } from './types';

/**
 * Stores audio on local disk under env.localStorageRoot, served back out via
 * the `/uploads` static route mounted in app.ts. publicId is the file's path
 * relative to that root (used both to build the URL and to delete it later).
 */
export class LocalStorageProvider implements AudioStorageProviderImpl {
  readonly name = 'local' as const;

  async upload({ buffer, folder, filename }: AudioUploadInput): Promise<AudioStorageRef> {
    const ext = path.extname(filename) || '.wav';
    const relativePath = path.posix.join(folder, `${crypto.randomUUID()}${ext}`);
    const diskPath = path.join(env.localStorageRoot, relativePath);

    await fs.mkdir(path.dirname(diskPath), { recursive: true });
    await fs.writeFile(diskPath, buffer);

    return {
      provider: 'local',
      url: `${env.publicBaseUrl}/uploads/${relativePath}`,
      publicId: relativePath,
    };
  }

  async delete(ref: Pick<AudioStorageRef, 'publicId'>): Promise<void> {
    const diskPath = path.join(env.localStorageRoot, ref.publicId);
    try {
      await fs.unlink(diskPath);
    } catch (err) {
      logger.warn(`Local audio file already missing or couldn't be deleted: ${diskPath}`, err);
    }
  }
}
