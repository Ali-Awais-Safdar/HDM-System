import "dotenv/config";
import { z } from "zod";

/**
 * Comprehensive environment configuration with enhanced validation.
 * All runtime configuration goes through Zod validation.
 * This follows the "validate everything at the boundary" rule.
 */
const EnvSchema = z.object({
  // Application
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  
  // Database
  DATABASE_URL: z.string().url().refine(
    (url) => url.startsWith('postgres://') || url.startsWith('postgresql://'),
    { message: "DATABASE_URL must be a valid PostgreSQL connection string" }
  ),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  DATABASE_TIMEOUT: z.coerce.number().int().min(1000).max(30000).default(5000),
  
  // Authentication
  JWT_SECRET: z.string().min(32, "JWT_SECRET should be at least 32 characters long")
    .refine((secret) => !/^[a-zA-Z0-9]+$/.test(secret), {
      message: "JWT_SECRET should contain special characters for better security"
    }),
  JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, "JWT_EXPIRES_IN must be in format like '15m', '2h', '7d'").default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, "JWT_REFRESH_EXPIRES_IN must be in format like '15m', '2h', '7d'").default("7d"),
  
  // File Storage
  STORAGE_PATH: z.string().default("./storage"),
  MAX_FILE_SIZE: z.coerce.number().int().min(1024).max(100 * 1024 * 1024).default(10 * 1024 * 1024), // 10MB default
  ALLOWED_MIME_TYPES: z.string().default("application/pdf,image/jpeg,image/png,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  
  // Security
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  CORS_ORIGINS: z.string().default("*").transform((origins) => 
    origins === "*" ? "*" : origins.split(",").map(origin => origin.trim())
  ),
  
  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),
  
  // Rate Limiting (for future use)
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(60000).default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
  
  // Health Check
  HEALTH_CHECK_TIMEOUT: z.coerce.number().int().min(1000).max(10000).default(5000),
}).transform((data) => ({
  ...data,
  // Parse allowed MIME types into array
  ALLOWED_MIME_TYPES: typeof data.ALLOWED_MIME_TYPES === 'string' 
    ? data.ALLOWED_MIME_TYPES.split(",").map(type => type.trim())
    : data.ALLOWED_MIME_TYPES,
  
  // Computed values
  IS_PRODUCTION: data.NODE_ENV === "production",
  IS_DEVELOPMENT: data.NODE_ENV === "development",
  IS_TEST: data.NODE_ENV === "test",
}));

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with helpful errors.
  // Avoid throwing raw errors across layers (see your error-handling guidance).
  console.error("❌ Invalid environment configuration:");
  console.error("Field Errors:", parsed.error.flatten().fieldErrors);
  console.error("Form Errors:", parsed.error.flatten().formErrors);
  
  // Show specific validation issues
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  
  process.exit(1);
}

export const env = parsed.data;

// Validate critical configurations at startup
if (env.IS_PRODUCTION) {
  if (env.JWT_SECRET.length < 64) {
    console.warn("⚠️  WARNING: JWT_SECRET should be at least 64 characters in production");
  }
  
  if (env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1')) {
    console.warn("⚠️  WARNING: Using localhost database in production");
  }
  
  if (env.CORS_ORIGINS === "*") {
    console.warn("⚠️  WARNING: CORS is set to allow all origins in production");
  }
}
