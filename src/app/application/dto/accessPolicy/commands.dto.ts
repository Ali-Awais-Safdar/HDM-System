import { Schema as S } from "effect"
import { DocumentId, UserId, AccessPolicyId, WorkspaceId } from "@domain/refined/ids"
import { AccessPolicyStruct } from "@domain/accessPolicy/access-policy.schema"

export const AddPolicyCommandSchema = AccessPolicyStruct.pick("resourceType", "resourceId", "subjectType", "subjectId", "role", "actions", "effect")
  .pipe(S.extend(S.Struct({ workspaceId: WorkspaceId, actorId: UserId })))
export type AddPolicyCommand = S.Schema.Type<typeof AddPolicyCommandSchema>
export type AddPolicyCommandEncoded = S.Schema.Encoded<typeof AddPolicyCommandSchema>

export const decodeAddPolicyCommand = S.decodeUnknown(AddPolicyCommandSchema)

export const RemovePolicyCommandSchema = S.Struct({
  workspaceId: WorkspaceId,
  policyId: AccessPolicyId,
  documentId: S.optional(DocumentId), // Optional for bulk operations
  actorId: UserId // Required for all operations
})
export type RemovePolicyCommand = S.Schema.Type<typeof RemovePolicyCommandSchema>
export type RemovePolicyCommandEncoded = S.Schema.Encoded<typeof RemovePolicyCommandSchema>

export const decodeRemovePolicyCommand = S.decodeUnknown(RemovePolicyCommandSchema)

export const UpdatePolicyActionsCommandSchema = AccessPolicyStruct.pick("actions")
  .pipe(S.extend(S.Struct({ 
    workspaceId: WorkspaceId,
    policyId: AccessPolicyId,
    documentId: S.optional(DocumentId), // Optional for bulk operations
    actorId: UserId // Required for all operations
  })))
export type UpdatePolicyActionsCommand = S.Schema.Type<typeof UpdatePolicyActionsCommandSchema>
export type UpdatePolicyActionsCommandEncoded = S.Schema.Encoded<typeof UpdatePolicyActionsCommandSchema>

export const decodeUpdatePolicyActionsCommand = S.decodeUnknown(UpdatePolicyActionsCommandSchema)

export const AccessPolicyCommandDTO = {
  AddPolicyCommandSchema,
  RemovePolicyCommandSchema,
  UpdatePolicyActionsCommandSchema,
  
  // Decoders
  decodeAddPolicyCommand,
  decodeRemovePolicyCommand,
  decodeUpdatePolicyActionsCommand
} as const

