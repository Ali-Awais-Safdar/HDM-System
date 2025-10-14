import { Schema as S } from "effect"
import { RoleSchema, PermissionActionSchema } from "@domain/accessPolicy/access-policy.schema"
import { Optional } from "@domain/utils/schema.utils"
import { DocumentId, UserId } from "@domain/refined/ids"

/**
 * This schema ensures consistent input validation for access control operations
 * and is used by DocumentAccessService to validate context data before passing
 * it to DocumentAccessPolicy for evaluation.
 * 
 * Key features:
 * - Validates all required context fields
 * - Ensures proper types for IDs and roles
 * - Validates user policies array structure
 * - Used at domain service boundaries
 */

const PolicyView = S.Struct({
  subjectType: S.Union(S.Literal("user"), S.Literal("role")),
  subjectId: Optional(UserId),
  role: Optional(RoleSchema),
  actions: S.Array(PermissionActionSchema)
})

export const DocumentAccessContextSchema = S.Struct({
  userId: UserId,
  roles: S.Array(RoleSchema),
  documentId: DocumentId,
  documentOwnerId: UserId,
  userPolicies: S.Array(PolicyView)
})
export type DocumentAccessContextSchema = S.Schema.Type<typeof DocumentAccessContextSchema>


export const createDocumentAccessContext = (context: unknown) =>
  S.decodeUnknown(DocumentAccessContextSchema)(context)