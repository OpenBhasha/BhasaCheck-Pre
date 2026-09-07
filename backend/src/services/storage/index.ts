import { AudioStorageProvider } from '../../types';
import { AudioStorageProviderImpl } from './types';
import { CloudinaryStorageProvider } from './cloudinaryStorage.provider';
import { LocalStorageProvider } from './localStorage.provider';

const providers: Record<AudioStorageProvider, AudioStorageProviderImpl> = {
  cloudinary: new CloudinaryStorageProvider(),
  local: new LocalStorageProvider(),
};

export function getAudioStorageProvider(type: AudioStorageProvider): AudioStorageProviderImpl {
  return providers[type];
}

export * from './types';
