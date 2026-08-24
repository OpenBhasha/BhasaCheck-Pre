import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 5000),
  isTest: process.env.NODE_ENV === 'test',

  mongodbUri: required('MONGODB_URI', process.env.NODE_ENV === 'test' ? 'mongodb://localhost:27017/rsml_test' : undefined),

  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'test' ? 'test-secret' : undefined),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', process.env.NODE_ENV === 'test' ? 'test-refresh-secret' : undefined),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? '',

  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  mlServiceUrl: process.env.ML_SERVICE_URL ?? 'http://localhost:8000',
  internalServiceSecret: process.env.INTERNAL_SERVICE_SECRET ?? 'dev-internal-secret',
  internalCallbackUrl: process.env.INTERNAL_CALLBACK_URL ?? `http://localhost:${process.env.PORT ?? 5000}`,

  maxAudioFileSizeMb: Number(process.env.MAX_AUDIO_FILE_SIZE_MB ?? 200),
  allowedAudioFormats: (process.env.ALLOWED_AUDIO_FORMATS ?? 'wav,mp3,m4a,flac,ogg').split(','),

  corsOrigin: process.env.CORS_ORIGIN ?? '*',
};
