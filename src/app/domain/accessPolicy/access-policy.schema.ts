import { Schema as S } from "effect"
import { Optional } from "@domain/utils/schema.utils"
import { DateTime } from "@domain/refined/date-time"

export const PermissionActionSchema = S.Union(
  S.Literal("read"),
  S.Literal("update"),
  S.Literal("delete"),
  S.Literal("download"),
  S.Literal("share")
)
export type PermissionAction = S.Schema.Type<typeof PermissionActionSchema>

export const SubjectTypeSchema = S.Union(
  S.Literal("user"),
  S.Literal("role")
)
export type SubjectType = S.Schema.Type<typeof SubjectTypeSchema>

export const RoleSchema = S.Union(
  S.Literal("ADMIN"),
  S.Literal("USER")
)
export type Role = S.Schema.Type<typeof RoleSchema>

export const PermissionLevelSchema = S.Union(
  S.Literal("read"),
  S.Literal("write"),
  S.Literal("admin")
)
export type PermissionLevel = S.Schema.Type<typeof PermissionLevelSchema>

export const AccessPolicySchema = S.Struct({
  id: S.String,
  resourceType: S.Literal("document"),
  resourceId: S.String,
  subjectType: SubjectTypeSchema,
  subjectId: Optional(S.String), // Accepts null/undefined and transforms to Option<string>
  role: Optional(RoleSchema), // Accepts null/undefined and transforms to Option<Role>
  actions: S.Array(PermissionActionSchema),
  effect: S.Literal("allow"),
  createdAt: DateTime
})
export type AccessPolicy = S.Schema.Type<typeof AccessPolicySchema>
export type AccessPolicyArray = ReadonlyArray<AccessPolicy>

export const makeAccessPolicy = (input: unknown) => S.decodeUnknown(AccessPolicySchema)(input)
