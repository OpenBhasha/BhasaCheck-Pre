import multer from 'multer';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

const AUDIO_MIME_PREFIXES = ['audio/'];

export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxAudioFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isAudioMime = AUDIO_MIME_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix));
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const isAllowedExt = env.allowedAudioFormats.includes(ext);
    if (!isAudioMime && !isAllowedExt) {
      cb(ApiError.badRequest(`Unsupported audio format: ${file.mimetype || ext}`));
      return;
    }
    cb(null, true);
  },
});
