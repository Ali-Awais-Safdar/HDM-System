import { drizzle } from "drizzle-orm/node-postgres";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../../env/env";
import * as schema from "./schema";

const pool = new pg.Pool({ 
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_SIZE,
  idleTimeoutMillis: env.DATABASE_TIMEOUT,
});

// Export typed database instance
export const db = drizzle(pool, { schema });

// Export database type for use in repositories
export type Database = NodePgDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
