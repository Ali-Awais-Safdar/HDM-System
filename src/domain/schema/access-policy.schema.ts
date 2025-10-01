import { Schema as S } from "effect"

// 1) Actions your app recognizes (adjust names to match your use-cases)
export const PermissionActionSchema = S.Union(
  S.Literal("read"),      // view document / metadata
  S.Literal("update"),    // update metadata/content
  S.Literal("delete"),    // delete document
  S.Literal("download"),  // generate/download
  S.Literal("share")      // share permissions
)
export type PermissionAction = S.Schema.Type<typeof PermissionActionSchema>

// 2) Subjects (who a policy targets)
export const SubjectTypeSchema = S.Union(
  S.Literal("user"),
  S.Literal("role")
)
export type SubjectType = S.Schema.Type<typeof SubjectTypeSchema>

// 3) Roles central to RBAC - simplified to ADMIN and USER
export const RoleSchema = S.Union(
  S.Literal("ADMIN"),
  S.Literal("USER")
)
export type Role = S.Schema.Type<typeof RoleSchema>

// 4) AccessPolicy structure (pure data, no methods)
export const AccessPolicySchema = S.Struct({
  id: S.String, // keep string for compatibility; refine later
  resourceType: S.Literal("document"),
  resourceId: S.String,
  subjectType: SubjectTypeSchema,              // "user" | "role"
  subjectId: S.optional(S.String),       // if subjectType==="user"
  role: S.optional(RoleSchema),                // if subjectType==="role"
  actions: S.Array(PermissionActionSchema),    // allowed actions
  effect: S.Literal("allow")             // (deny policies can be added later)
})
export type AccessPolicy = S.Schema.Type<typeof AccessPolicySchema>
export type AccessPolicyArray = ReadonlyArray<AccessPolicy>

// Factory functions for creating AccessPolicy from unknown input using Effect pipeline
export const makeAccessPolicy = (input: unknown) => S.decodeUnknown(AccessPolicySchema)(input)
