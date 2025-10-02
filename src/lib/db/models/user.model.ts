import { pgTable, varchar, jsonb } from "drizzle-orm/pg-core"
import { SharedColumns, UuidCol } from "../shared-columns"

/**
 * Users table with SharedColumns pattern.
 * Stores user authentication and authorization data.
 */
export const users = pgTable("users", {
  ...SharedColumns,
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  roles: jsonb("roles").$type<string[]>().notNull(),
  workspaceId: UuidCol("workspace_id")
})

// Type inference from Drizzle schema
export type UserModel = typeof users.$inferSelect
export type NewUserModel = typeof users.$inferInsert

