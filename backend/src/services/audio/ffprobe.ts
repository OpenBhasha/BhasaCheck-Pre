import { spawn } from 'child_process';
import { logger } from '../../config/logger';

export interface AudioProbeResult {
  durationSec: number | null;
  sampleRate: number | null;
  channels: number | null;
  format: string | null;
}

const EMPTY_RESULT: AudioProbeResult = {
  durationSec: null,
  sampleRate: null,
  channels: null,
  format: null,
};

/**
 * Probes a local audio file with ffprobe. Returns nulls (rather than throwing)
 * if ffprobe isn't installed or the file can't be read, so upload never fails
 * on metadata extraction alone.
 */
export function probeAudioFile(filePath: string): Promise<AudioProbeResult> {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    let stdout = '';
    ffprobe.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    ffprobe.on('error', (err) => {
      logger.warn('ffprobe not available, skipping audio metadata probe', err.message);
      resolve(EMPTY_RESULT);
    });

    ffprobe.on('close', (code) => {
      if (code !== 0 || !stdout) {
        resolve(EMPTY_RESULT);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const audioStream = (parsed.streams ?? []).find((s: { codec_type?: string }) => s.codec_type === 'audio');
        resolve({
          durationSec: parsed.format?.duration ? Number(parsed.format.duration) : null,
          sampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : null,
          channels: audioStream?.channels ? Number(audioStream.channels) : null,
          format: parsed.format?.format_name ?? null,
        });
      } catch (err) {
        logger.warn('Failed to parse ffprobe output', err);
        resolve(EMPTY_RESULT);
      }
    });
  });
}
