import { Schema as S } from "effect"
import { Optional } from "@domain/utils/schema.utils"
import { BaseEntitySchema } from "@domain/utils/schema.base"
import { AccessPolicyId, DocumentId, UserId } from "@domain/refined/ids"

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

export const AccessPolicyStruct = S.Struct({
  resourceType: S.Literal("document"),
  resourceId: DocumentId,
  subjectType: SubjectTypeSchema,
  subjectId: Optional(UserId),
  role: Optional(RoleSchema),
  actions: S.Array(PermissionActionSchema),
  effect: S.Literal("allow")
})

export const AccessPolicyFields = AccessPolicyStruct.fields

export const AccessPolicySchema = S.extend(
  BaseEntitySchema(AccessPolicyId),
  AccessPolicyStruct
)
export type AccessPolicy = S.Schema.Type<typeof AccessPolicySchema>
export type AccessPolicyArray = ReadonlyArray<AccessPolicy>
