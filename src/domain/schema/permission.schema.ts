import { Schema as S } from "effect"
import { PermissionId, UserId, DocumentId } from "../value-objects/id.vo"
import { DateTime } from "../value-objects/datetime.vo"
import { isValidPermissionLevel } from "../guards/domain.guards"

export const PermissionLevel = S.Literal("read", "write", "admin")
export type PermissionLevel = S.Schema.Type<typeof PermissionLevel>

// Domain schema with embedded guards
export const Permission = S.Struct({
  id: PermissionId,
  documentId: DocumentId,
  userId: UserId,
  level: PermissionLevel.pipe(
    S.filter(isValidPermissionLevel, { message: () => "Invalid permission level" })
  ),
  createdAt: DateTime
})
export type Permission = S.Schema.Type<typeof Permission>

// Persistence row (snake_case) - wire format
export const PermissionRow = S.Struct({
  id: S.String,
  document_id: S.String,
  user_id: S.String,
  permission: S.String,
  created_at: S.Date
})
export type PermissionRow = S.Schema.Type<typeof PermissionRow>

// Transform Row <-> Domain (normalize at boundaries)
export const PermissionCodec = S.transform(PermissionRow, Permission, {
  decode: (r) => ({
    id: r.id as any,
    documentId: r.document_id as any,
    userId: r.user_id as any,
    level: r.permission as any,
    createdAt: r.created_at
  }),
  encode: (d) => ({
    id: d.id,
    document_id: d.documentId,
    user_id: d.userId,
    permission: d.level,
    created_at: d.createdAt
  }),
  strict: false
})

// Factory functions for creating from unknown input using Effect pipeline
export const makePermission = (input: unknown) => S.decodeUnknown(Permission)(input)
export const makePermissionRow = (input: unknown) => S.decodeUnknown(PermissionRow)(input)
