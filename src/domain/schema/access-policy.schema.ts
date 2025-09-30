import { Schema as S } from "effect"

// 1) Actions your app recognizes (adjust names to match your use-cases)
export const PermissionAction = S.Union(
  S.Literal("read"),      // view document / metadata
  S.Literal("update"),    // update metadata/content
  S.Literal("delete"),    // delete document
  S.Literal("download"),  // generate/download
  S.Literal("share")      // share permissions
)
export type PermissionAction = S.Schema.Type<typeof PermissionAction>

// 2) Subjects (who a policy targets)
export const SubjectType = S.Union(
  S.Literal("user"),
  S.Literal("role")
)
export type SubjectType = S.Schema.Type<typeof SubjectType>

// 3) Roles central to RBAC (you can expand these later)
export const Role = S.Union(
  S.Literal("ADMIN"),
  S.Literal("EDITOR"),
  S.Literal("VIEWER"),
  S.Literal("GUEST")
)
export type Role = S.Schema.Type<typeof Role>

// 4) AccessPolicy structure (pure data, no methods)
export const AccessPolicy = S.Struct({
  id: S.String, // keep string for compatibility; refine later
  resourceType: S.Literal("document"),
  resourceId: S.String,
  subjectType: SubjectType,              // "user" | "role"
  subjectId: S.optional(S.String),       // if subjectType==="user"
  role: S.optional(Role),                // if subjectType==="role"
  actions: S.Array(PermissionAction),    // allowed actions
  effect: S.Literal("allow")             // (deny policies can be added later)
})
export type AccessPolicy = S.Schema.Type<typeof AccessPolicy>
export type AccessPolicyArray = ReadonlyArray<AccessPolicy>

// Factory functions for creating AccessPolicy from unknown input
export const makeAccessPolicy = (input: unknown) => S.decodeUnknownSync(AccessPolicy)(input)
