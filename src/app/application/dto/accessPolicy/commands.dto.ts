import { Schema as S } from "effect"
import { DocumentId, UserId, AccessPolicyId, WorkspaceId } from "@domain/refined/ids"
import { AccessPolicyStruct } from "@domain/accessPolicy/access-policy.schema"

// ===== INPUT SCHEMAS (Client-supplied, no auth/workspace fields) =====

export const AddPolicyInputSchema = AccessPolicyStruct.pick("resourceType", "resourceId", "subjectType", "subjectId", "role", "actions", "effect")

export const RemovePolicyInputSchema = S.Struct({
  policyId: AccessPolicyId,
  documentId: S.optional(DocumentId)
})

export const UpdatePolicyActionsInputSchema = AccessPolicyStruct.pick("actions")
  .pipe(S.extend(S.Struct({ 
    policyId: AccessPolicyId,
    documentId: S.optional(DocumentId)
  })))

// ===== COMMAND SCHEMAS (Internal, with injected auth/workspace fields) =====

export const AddPolicyCommandSchema = AccessPolicyStruct.pick("resourceType", "resourceId", "subjectType", "subjectId", "role", "actions", "effect")
  .pipe(S.extend(S.Struct({ workspaceId: WorkspaceId, actorId: UserId })))
export type AddPolicyCommand = S.Schema.Type<typeof AddPolicyCommandSchema>
export type AddPolicyCommandEncoded = S.Schema.Encoded<typeof AddPolicyCommandSchema>


export const RemovePolicyCommandSchema = S.Struct({
  workspaceId: WorkspaceId,
  policyId: AccessPolicyId,
  documentId: S.optional(DocumentId),
  actorId: UserId
})
export type RemovePolicyCommand = S.Schema.Type<typeof RemovePolicyCommandSchema>
export type RemovePolicyCommandEncoded = S.Schema.Encoded<typeof RemovePolicyCommandSchema>


export const UpdatePolicyActionsCommandSchema = AccessPolicyStruct.pick("actions")
  .pipe(S.extend(S.Struct({ 
    workspaceId: WorkspaceId,
    policyId: AccessPolicyId,
    documentId: S.optional(DocumentId),
    actorId: UserId
  })))
export type UpdatePolicyActionsCommand = S.Schema.Type<typeof UpdatePolicyActionsCommandSchema>
export type UpdatePolicyActionsCommandEncoded = S.Schema.Encoded<typeof UpdatePolicyActionsCommandSchema>



