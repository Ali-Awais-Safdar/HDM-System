import { pgTable, varchar, integer, index, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { SharedColumns, UuidCol } from "../shared-columns"
import { documents } from "./document.model"
import { users } from "./user.model"

/**
 * Document versions table with SharedColumns pattern.
 * Stores file metadata for each version of a document.
 */
export const documentVersions = pgTable("document_versions", {
  ...SharedColumns,
  documentId: UuidCol("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  checksum: varchar("checksum", { length: 64 }).notNull(), // SHA-256 hex
  fileKey: varchar("file_key", { length: 512 }).notNull(),
  mimeType: varchar("mime_type", { length: 127 }).notNull(),
  size: integer("size").notNull(), // Size in bytes
  createdBy: UuidCol("created_by").references(() => users.id, { onDelete: "set null" })
}, (table) => ({
  documentIdx: index("document_versions_document_idx").on(table.documentId),
  createdAtIdx: index("document_versions_created_at_idx").on(table.createdAt),
  docVerUnique: unique("document_versions_doc_ver_unique").on(table.documentId, table.version),
  versionCheck: sql`check (version >= 1)`
}))

// Type inference from Drizzle schema
export type DocumentVersionModel = typeof documentVersions.$inferSelect
export type NewDocumentVersionModel = typeof documentVersions.$inferInsert

