import { pgTable, varchar, jsonb, index } from "drizzle-orm/pg-core"
import { SharedColumns, UuidCol } from "../shared-columns"
import { documents } from "./document.model"
import { users } from "./user.model"

/**
 * Access policies table with SharedColumns pattern.
 * Stores document-level access control policies for users and roles.
 */
export const accessPolicies = pgTable("access_policies", {
  ...SharedColumns,
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: UuidCol("resource_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  subjectType: varchar("subject_type", { length: 50 }).notNull(), // "user" | "role"
  subjectId: UuidCol("subject_id").references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }),
  actions: jsonb("actions").$type<string[]>().notNull(),
  effect: varchar("effect", { length: 50 }).notNull() // "allow"
}, (table) => [
  index("access_policies_resource_idx").on(table.resourceId),
  index("access_policies_subject_idx").on(table.subjectId),
  index("access_policies_role_idx").on(table.role),
  index("access_policies_created_at_idx").on(table.createdAt)
])

// Type inference from Drizzle schema
export type AccessPolicyModel = typeof accessPolicies.$inferSelect
export type NewAccessPolicyModel = typeof accessPolicies.$inferInsert

