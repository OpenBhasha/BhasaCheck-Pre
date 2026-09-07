import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { probeAudioFile } from './ffprobe';
import { IAudioRef } from '../../models/Dataset';
import { getAudioStorageProvider } from '../storage';
import { AudioStorageProvider } from '../../types';

export interface UploadedAudio {
  audioRef: IAudioRef;
}

/**
 * Writes the uploaded buffer to a temp file (so ffprobe can read it), probes
 * its metadata, uploads the original bytes to whichever storage backend the
 * caller chose, then cleans up the temp file regardless of outcome.
 */
export async function processAndUploadAudio(
  file: Express.Multer.File,
  projectId: string,
  storageProvider: AudioStorageProvider
): Promise<UploadedAudio> {
  const tempPath = path.join(os.tmpdir(), `upload-${crypto.randomUUID()}-${file.originalname}`);
  await fs.writeFile(tempPath, file.buffer);

  try {
    const probe = await probeAudioFile(tempPath);
    const result = await getAudioStorageProvider(storageProvider).upload({
      buffer: file.buffer,
      folder: `projects/${projectId}/audio`,
      filename: file.originalname,
    });

    const audioRef: IAudioRef = {
      provider: result.provider,
      url: result.url,
      publicId: result.publicId,
      format: probe.format ?? undefined,
      durationSec: probe.durationSec,
      fileSizeBytes: file.size,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
    };

    return { audioRef };
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
}
