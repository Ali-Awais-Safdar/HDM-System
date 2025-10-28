import { pgTable, varchar, text, jsonb, index, timestamp } from "drizzle-orm/pg-core"
import { UuidCol } from "../shared-columns"


export const auditLogs = pgTable("audit_logs", {
  id: UuidCol("id").primaryKey().defaultRandom(),
  
  // Actor and context
  actorId: UuidCol("actor_id").notNull(),
  workspaceId: UuidCol("workspace_id").notNull(),
  
  // Resource identification
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: UuidCol("resource_id").notNull(),
  
  // Action details
  action: varchar("action", { length: 50 }).notNull(),
  outcome: varchar("outcome", { length: 20 }).notNull(), // "success" or "failure"
  
  // Correlation and debugging
  correlationId: varchar("correlation_id", { length: 255 }),
  reason: text("reason"), // Error reason if outcome is failure
  
  // Additional context (sanitized)
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  
  // Timestamp (append-only, no updates)
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Indexes for common queries
  actorIdx: index("audit_logs_actor_idx").on(table.actorId),
  workspaceIdx: index("audit_logs_workspace_idx").on(table.workspaceId),
  resourceIdx: index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
  correlationIdx: index("audit_logs_correlation_idx").on(table.correlationId),
  createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  outcomeIdx: index("audit_logs_outcome_idx").on(table.outcome),
  // Composite index for resource audit trail queries
  resourceAuditTrailIdx: index("audit_logs_resource_audit_trail_idx")
    .on(table.resourceType, table.resourceId, table.createdAt),
}))

// Type inference from Drizzle schema
export type AuditLogModel = typeof auditLogs.$inferSelect
export type NewAuditLogModel = typeof auditLogs.$inferInsert

