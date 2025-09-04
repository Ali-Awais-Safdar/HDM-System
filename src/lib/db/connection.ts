import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../../env/env";
import * as schema from "./schema";
import { DatabaseInterface, DatabaseTransactionInterface } from "./interfaces";

const pool = new pg.Pool({ 
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_SIZE,
  idleTimeoutMillis: env.DATABASE_TIMEOUT,
});

// Export typed database instance
export const db: DatabaseInterface = drizzle(pool, { schema });

// Export database types for use in repositories
// These maintain backward compatibility while providing proper type safety
export type Database = DatabaseInterface;
export type DatabaseTransaction = DatabaseTransactionInterface;
