import { pgTable, varchar, text, jsonb, index } from "drizzle-orm/pg-core"
import { SharedColumns, UuidCol } from "../shared-columns"
import { users } from "./user.model"

/**
 * Documents table with SharedColumns pattern.
 * Stores document metadata and ownership information.
 */
export const documents = pgTable("documents", {
  ...SharedColumns,
  ownerId: UuidCol("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  tags: jsonb("tags").$type<string[]>(),
  currentVersionId: UuidCol("current_version_id").notNull()
}, (table) => [
  index("documents_owner_idx").on(table.ownerId),
  index("documents_title_idx").on(table.title),
  index("documents_created_at_idx").on(table.createdAt),
  index("documents_current_version_idx").on(table.currentVersionId)
])

// Type inference from Drizzle schema
export type DocumentModel = typeof documents.$inferSelect
export type NewDocumentModel = typeof documents.$inferInsert

