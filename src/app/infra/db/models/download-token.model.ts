import { pgTable, varchar, timestamp, index } from "drizzle-orm/pg-core"
import { SharedColumns, UuidCol } from "../shared-columns"
import { documents } from "./document.model"
import { users } from "./user.model"

/**
 * Download tokens table with SharedColumns pattern.
 * Stores time-limited, single-use tokens for secure document downloads.
 */
export const downloadTokens = pgTable("download_tokens", {
  ...SharedColumns,
  token: varchar("token", { length: 255 }).notNull().unique(),
  documentId: UuidCol("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  issuedTo: UuidCol("issued_to")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "date" })
}, (table) => [
  index("download_tokens_document_idx").on(table.documentId),
  index("download_tokens_issued_to_idx").on(table.issuedTo),
  index("download_tokens_expires_at_idx").on(table.expiresAt),
  index("download_tokens_used_at_idx").on(table.usedAt)
])

// Type inference from Drizzle schema
export type DownloadTokenModel = typeof downloadTokens.$inferSelect
export type NewDownloadTokenModel = typeof downloadTokens.$inferInsert

