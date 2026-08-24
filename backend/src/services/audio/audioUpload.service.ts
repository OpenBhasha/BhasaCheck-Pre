import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { uploadAudioBuffer } from '../cloudinary.service';
import { probeAudioFile } from './ffprobe';
import { IAudioRef } from '../../models/Dataset';

export interface UploadedAudio {
  audioRef: IAudioRef;
}

/**
 * Writes the uploaded buffer to a temp file (so ffprobe can read it), probes
 * its metadata, uploads the original bytes to Cloudinary, then cleans up the
 * temp file regardless of outcome.
 */
export async function processAndUploadAudio(
  file: Express.Multer.File,
  projectId: string
): Promise<UploadedAudio> {
  const tempPath = path.join(os.tmpdir(), `upload-${crypto.randomUUID()}-${file.originalname}`);
  await fs.writeFile(tempPath, file.buffer);

  try {
    const probe = await probeAudioFile(tempPath);
    const result = await uploadAudioBuffer(file.buffer, { folder: `rsml/projects/${projectId}/audio` });

    const audioRef: IAudioRef = {
      url: result.secure_url,
      publicId: result.public_id,
      format: probe.format ?? result.format ?? undefined,
      durationSec: probe.durationSec ?? (result.duration ? Number(result.duration) : null),
      fileSizeBytes: file.size,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
    };

    return { audioRef };
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }
}
