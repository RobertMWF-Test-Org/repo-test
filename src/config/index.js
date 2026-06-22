/**
 * Application configuration.
 * Values are read from environment variables with safe defaults for development.
 */

// ─── Server ───────────────────────────────────────────────────────────────────

export const PORT = parseInt(process.env.PORT ?? "3000", 10);
export const HOST = process.env.HOST ?? "0.0.0.0";
export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const IS_PRODUCTION = NODE_ENV === "production";

// ─── Database ─────────────────────────────────────────────────────────────────

export const DB_HOST = process.env.DB_HOST ?? "localhost";
export const DB_PORT = parseInt(process.env.DB_PORT ?? "5432", 10);
export const DB_NAME = process.env.DB_NAME ?? "appdb";
export const DB_POOL_MIN = 2;
export const DB_POOL_MAX = 10;

// ─── Redis ────────────────────────────────────────────────────────────────────

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
export const REDIS_KEY_PREFIX = "app:";
export const REDIS_SESSION_TTL = 60 * 60 * 24; // 24 hours

// ─── JWT ──────────────────────────────────────────────────────────────────────

export const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-do-not-use-in-production";
export const JWT_ALGORITHM = "HS256";
export const JWT_ACCESS_EXPIRY = "5m";
export const JWT_REFRESH_EXPIRY = "14d";
export const JWT_ISSUER = process.env.JWT_ISSUER ?? "api.example.com";

// ─── Rate limiting ────────────────────────────────────────────────────────────

export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_MAX_REQUESTS = 100;
export const RATE_LIMIT_AUTH_MAX = 10;

// ─── CORS ─────────────────────────────────────────────────────────────────────

export const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3001";
export const CORS_CREDENTIALS = true;
