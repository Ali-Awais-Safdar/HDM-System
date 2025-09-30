import { 
  pgTable, 
  timestamp, 
  varchar, 
  text,
  integer,
  jsonb, 
  index,
  uniqueIndex,
  foreignKey,
  pgEnum
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * NOTE: We do NOT use DB-generated IDs. The application generates UUIDs v7 (see src/shared/uuid.ts).
 * This aligns with your guideline for app-generated IDs and lowers coupling to the DB.
 * UUIDs v7 provide better performance due to their time-ordered nature.
 */

// Enums for better type safety
export const roleEnum = pgEnum("role", ["admin", "user"]);
export const permissionEnum = pgEnum("permission", ["read", "write", "admin"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(), // UUIDv7 as text for better performance
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("users_email_idx").on(table.email),
]);

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  tags: jsonb("tags").$type<string[]>().default([]),
  currentVersionId: text("current_version_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("documents_owner_idx").on(table.ownerId),
  index("documents_title_idx").on(table.title),
  index("documents_created_at_idx").on(table.createdAt),
  index("documents_current_version_idx").on(table.currentVersionId),
  foreignKey({
    columns: [table.ownerId],
    foreignColumns: [users.id],
  }),
]);

export const documentVersions = pgTable("document_versions", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  version: integer("version").notNull(),
  checksum: varchar("checksum", { length: 64 }).notNull(), // SHA-256 hex string
  fileKey: text("file_key").notNull(),
  mimeType: varchar("mime_type", { length: 127 }).notNull(),
  size: integer("size").notNull(), // Size in bytes as integer
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
}, (table) => [
  index("document_versions_document_idx").on(table.documentId),
  index("document_versions_version_idx").on(table.documentId, table.version),
  index("document_versions_created_at_idx").on(table.createdAt),
  foreignKey({
    columns: [table.documentId],
    foreignColumns: [documents.id],
  }),
  foreignKey({
    columns: [table.createdBy],
    foreignColumns: [users.id],
  }),
]);

export const tags = pgTable("tags", {
  id: text("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("tags_name_idx").on(table.name),
]);

export const documentTags = pgTable("document_tags", {
  documentId: text("document_id").notNull(),
  tagId: text("tag_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("document_tags_idx").on(table.documentId, table.tagId),
  index("document_tags_document_idx").on(table.documentId),
  index("document_tags_tag_idx").on(table.tagId),
  foreignKey({
    columns: [table.documentId],
    foreignColumns: [documents.id],
  }),
  foreignKey({
    columns: [table.tagId],
    foreignColumns: [tags.id],
  }),
]);

export const permissions = pgTable("permissions", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  userId: text("user_id").notNull(),
  permission: permissionEnum("permission").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("permissions_document_user_idx").on(table.documentId, table.userId),
  index("permissions_document_idx").on(table.documentId),
  index("permissions_user_idx").on(table.userId),
  foreignKey({
    columns: [table.documentId],
    foreignColumns: [documents.id],
  }),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
  }),
]);

export const downloadTokens = pgTable("download_tokens", {
  token: text("token").primaryKey(),
  documentId: text("document_id").notNull(),
  issuedTo: text("issued_to").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("download_tokens_document_idx").on(table.documentId),
  index("download_tokens_expires_idx").on(table.expiresAt),
  index("download_tokens_issued_to_idx").on(table.issuedTo),
  foreignKey({
    columns: [table.documentId],
    foreignColumns: [documents.id],
  }),
  foreignKey({
    columns: [table.issuedTo],
    foreignColumns: [users.id],
  }),
]);

// Relations for better TypeScript support
export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  permissions: many(permissions),
  downloadTokens: many(downloadTokens),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  owner: one(users, {
    fields: [documents.ownerId],
    references: [users.id],
  }),
  currentVersion: one(documentVersions, {
    fields: [documents.currentVersionId],
    references: [documentVersions.id],
  }),
  versions: many(documentVersions),
  permissions: many(permissions),
  documentTags: many(documentTags),
  downloadTokens: many(downloadTokens),
}));

export const documentVersionsRelations = relations(documentVersions, ({ one }) => ({
  document: one(documents, {
    fields: [documentVersions.documentId],
    references: [documents.id],
  }),
  creator: one(users, {
    fields: [documentVersions.createdBy],
    references: [users.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  documentTags: many(documentTags),
}));

export const documentTagsRelations = relations(documentTags, ({ one }) => ({
  document: one(documents, {
    fields: [documentTags.documentId],
    references: [documents.id],
  }),
  tag: one(tags, {
    fields: [documentTags.tagId],
    references: [tags.id],
  }),
}));

export const permissionsRelations = relations(permissions, ({ one }) => ({
  document: one(documents, {
    fields: [permissions.documentId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [permissions.userId],
    references: [users.id],
  }),
}));

export const downloadTokensRelations = relations(downloadTokens, ({ one }) => ({
  document: one(documents, {
    fields: [downloadTokens.documentId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [downloadTokens.issuedTo],
    references: [users.id],
  }),
}));
