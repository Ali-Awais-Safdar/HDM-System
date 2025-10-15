import { timestamp, text } from "drizzle-orm/pg-core"

/**
 * Branded UUID column wrapper for consistent UUID handling across tables.
 */
export const UuidCol = (name: string) => text(name)

export const SharedColumns = {
  id: UuidCol("id").primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
}

