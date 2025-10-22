import { timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

/**
 * Branded UUID column wrapper for consistent UUID handling across tables.
 * Uses PostgreSQL UUID type for proper DB-level validation.
 */
export const UuidCol = (name: string) => uuid(name)

export const SharedColumns = {
  id: UuidCol("id").primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).$onUpdate(() => sql`now()`)
}

