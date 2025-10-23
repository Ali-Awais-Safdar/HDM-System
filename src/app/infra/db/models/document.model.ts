import { pgTable, varchar, text, jsonb, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { SharedColumns, UuidCol } from "../shared-columns"
import { users } from "./user.model"

export const documents = pgTable("documents", {
  ...SharedColumns,
  ownerId: UuidCol("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  tags: jsonb("tags").$type<string[]>(),
}, (table) => ({
  ownerIdx: index("documents_owner_idx").on(table.ownerId),
  titleIdx: index("documents_title_idx").on(table.title),
  createdAtIdx: index("documents_created_at_idx").on(table.createdAt),
  tagsGinIdx: index("documents_tags_gin_idx").using("gin", sql`(${table.tags}::jsonb)`)
}))

// Type inference from Drizzle schema
export type DocumentModel = typeof documents.$inferSelect
export type NewDocumentModel = typeof documents.$inferInsert

