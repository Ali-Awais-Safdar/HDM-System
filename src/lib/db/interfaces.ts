import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema";

/**
 * Type-safe database interface extending Drizzle's NodePgDatabase.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DatabaseInterface extends NodePgDatabase<typeof schema> {}
