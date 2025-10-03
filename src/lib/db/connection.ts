import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../../env/env";
import * as schema from "./schema";
import type { DatabaseInterface } from "./interfaces";

const pool = new pg.Pool({ 
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_SIZE,
  idleTimeoutMillis: env.DATABASE_TIMEOUT,
});

export const db: DatabaseInterface = drizzle(pool, { schema });
