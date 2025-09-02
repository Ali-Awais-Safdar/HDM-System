import { pgTable, timestamp, varchar, uuid as pgUuid, jsonb } from "drizzle-orm/pg-core";

/**
 * NOTE: We do NOT use DB-generated IDs. The application generates UUIDs (see src/shared/uuid.ts).
 * This aligns with your guideline for app-generated IDs and lowers coupling to the DB. 
 */
export const users = pgTable("users", {
  id: pgUuid("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  hash: varchar("hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(), // "admin" | "user"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: pgUuid("id").primaryKey(),
  ownerId: pgUuid("owner_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 127 }).notNull(),
  sizeBytes: varchar("size_bytes", { length: 32 }).notNull(),
  tags: jsonb("tags").$type<string[]>().default([]).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
});

export const permissions = pgTable("permissions", {
  id: pgUuid("id").primaryKey(),
  documentId: pgUuid("document_id").notNull(),
  granteeUserId: pgUuid("grantee_user_id").notNull(),
  access: varchar("access", { length: 32 }).notNull(), // "read" | "write" | "owner"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
