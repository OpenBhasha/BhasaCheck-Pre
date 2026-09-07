process.env.NODE_ENV = 'test';

// env.ts calls dotenv.config() unconditionally, which would otherwise pull
// in the developer's real backend/.env (real Cloudinary credentials
// included) and make test behavior depend on whatever happens to be in it.
// dotenv.config() never overwrites a variable that's already set, so
// force-empty these before env.ts is ever imported to keep the test
// environment hermetic.
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Local audio storage writes real files — point it at a throwaway temp dir
// for tests instead of the repo's real storage/audio/.
const testStorageRoot = path.join(os.tmpdir(), `rsml-test-storage-${Date.now()}`);
process.env.LOCAL_STORAGE_ROOT = testStorageRoot;

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  await fs.rm(testStorageRoot, { recursive: true, force: true });
});
