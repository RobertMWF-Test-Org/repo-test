import { Request, Response, NextFunction } from "express";
import { Redis } from "ioredis";
import { logger } from "../utils/logger";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  skipSuccessfulRequests?: boolean;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  maxRequests: 500,
  keyPrefix: "rl:",
  skipSuccessfulRequests: false,
};

/**
 * Builds the Redis key for a given request identity.
 * Prefers authenticated user ID over IP to avoid penalising
 * users behind shared NAT (e.g. corporate proxies).
 */
function resolveKey(req: Request, prefix: string): string {
  const identity =
    (req as any).user?.id ?? req.ip ?? "anonymous";
  return `${prefix}${identity}`;
}

/**
 * Returns a sliding-window rate limiter middleware backed by Redis.
 * Uses an atomic Lua script so the check-and-increment is race-free
 * even under high concurrency.
 */
export function createRateLimiter(redis: Redis, config: Partial<RateLimitConfig> = {}) {
  const { windowMs, maxRequests, keyPrefix, skipSuccessfulRequests } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const windowSeconds = Math.ceil(windowMs / 1000);

  const luaScript = `
    local key    = KEYS[1]
    local window = tonumber(ARGV[1])
    local limit  = tonumber(ARGV[2])
    local now    = tonumber(ARGV[3])
    redis.call("ZREMRANGEBYSCORE", key, 0, now - window * 1000)
    local count = redis.call("ZCARD", key)
    if count < limit then
      redis.call("ZADD", key, now, now .. "-" .. math.random(1e9))
      redis.call("EXPIRE", key, window)
      return { count + 1, 0 }
    end
    return { count, 1 }
  `;

  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const key = resolveKey(req, keyPrefix!);
    const now = Date.now();

    try {
      const [count, rejected] = (await redis.eval(
        luaScript,
        1,
        key,
        String(windowSeconds),
        String(maxRequests),
        String(now)
      )) as [number, number];

      const info: RateLimitInfo = {
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - count),
        resetAt: new Date(now + windowMs),
      };

      res.setHeader("X-RateLimit-Limit", info.limit);
      res.setHeader("X-RateLimit-Remaining", info.remaining);
      res.setHeader("X-RateLimit-Reset", info.resetAt.toISOString());

      if (rejected) {
        logger.warn("Rate limit exceeded", { key, count });
        res.status(429).json({
          error: "Too Many Requests",
          retryAfter: info.resetAt.toISOString(),
        });
        return;
      }

      if (skipSuccessfulRequests) {
        const originalEnd = res.end.bind(res);
        (res as any).end = function (...args: any[]) {
          if (res.statusCode < 400) {
            redis.zrem(key, String(now)).catch(() => {});
          }
          return originalEnd(...args);
        };
      }

      next();
    } catch (err) {
      logger.error("Rate limiter Redis error", err as Error);
      next();
    }
  };
}

