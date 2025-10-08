export interface ConfigPort {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;

  DATABASE_URL: string;
  DATABASE_POOL_SIZE: number;
  DATABASE_TIMEOUT: number;

  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;

  BCRYPT_SALT_ROUNDS: number;

  STORAGE_PATH: string;
  ALLOWED_MIME_TYPES: string[];

  CORS_ORIGINS: string | string[];
  DOWNLOAD_TOKEN_CLOCK_SKEW_TOLERANCE_MS: number;
  LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  LOG_FORMAT: "json" | "pretty";
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  HEALTH_CHECK_TIMEOUT: number;
}


