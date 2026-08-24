import IORedis, { Redis } from 'ioredis';
import { env } from '../config/env';

let connection: Redis | null = null;

/**
 * BullMQ requires its own Redis connection with maxRetriesPerRequest: null
 * (separate from the general-purpose one in config/redis.ts).
 */
export function getQueueConnection(): Redis {
  if (!connection) {
    connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}
