const redis = require('redis');

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 2000) }
});

client.on('error', (err) => console.error('Redis error:', err));
client.connect().catch(console.error);

class CacheService {
  static async get(key) {
    try {
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null; // degrade gracefully on cache failure
    }
  }

  static async set(key, value, ttlSeconds) {
    try {
      await client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch {
      // degrade gracefully — cache miss is preferable to hard failure
    }
  }

  static async del(key) {
    try {
      await client.del(key);
    } catch {
      // degrade gracefully
    }
  }

  // Invalidate all keys matching a glob pattern, e.g. "session:*"
  static async invalidatePattern(pattern) {
    try {
      const keys = await client.keys(pattern);
      if (keys.length > 0) await client.del(keys);
    } catch {
      // degrade gracefully
    }
  }
}

module.exports = { CacheService };
