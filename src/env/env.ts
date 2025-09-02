import "dotenv/config";
import { z } from "zod";

/**
 * All runtime configuration goes through Zod validation.
 * This follows the "validate everything at the boundary" rule.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("3000"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET should be a long random string"),
  JWT_EXPIRES_IN: z.string().default("15m"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with helpful errors.
  // Avoid throwing raw errors across layers (see your error-handling guidance).
  console.error("❌ Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
