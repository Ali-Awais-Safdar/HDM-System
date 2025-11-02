import { Schema as S } from "effect"
import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { AccessPolicyWorkflow } from "@application/workflow/access-policy.workflow"
import type { RPCContext } from "../context"
import { executeEffect } from "../effect-adapter"
import { withActorAndWorkspace } from "../context"
import { toStandard } from "../standard"
import { withWorkspaceHeader } from "./utils"

import {
  AddPolicyInputSchema,
  RemovePolicyInputSchema,
  UpdatePolicyActionsInputSchema,
  GetDocumentPoliciesInputSchema,
  GetActorPoliciesInputSchema,
  AccessPolicyResponseSchema
} from "@application/dto/accessPolicy"

/**
 * Access Policy Procedures
 * 
 * RPC endpoints for access policy operations:
 * - addPolicy: Create a new access policy
 * - removePolicy: Remove an access policy
 * - updatePolicy: Update policy actions
 * - getDocumentPolicies: List all access policies for a document
 * - getActorPolicies: List policies filtered by actor for a document
 */

export const addPolicy = os
  .$context<RPCContext>()
  .meta(withWorkspaceHeader({
    summary: "Add access policy",
    description: "Create a new access policy",
    tags: ["Access Policies"]
  }))
  .route({
    method: "POST",
    path: "/documents/{resourceId}/access-policies",
    operationId: "accessPolicy.addPolicy"
  })
  .input(toStandard(AddPolicyInputSchema))
  .output(toStandard(AccessPolicyResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<AccessPolicyWorkflow>(TOKENS.ACCESS_POLICY_WORKFLOW)
    
    const command = withActorAndWorkspace({
      ...input
    }, context)
    
    return await executeEffect(
      workflow.addPolicy(command),
      {
        procedureName: "accessPolicy.addPolicy",
        rpcContext: context
      }
    )
  })

export const removePolicy = os
  .$context<RPCContext>()
  .meta(withWorkspaceHeader({
    summary: "Remove access policy",
    description: "Remove an access policy",
    tags: ["Access Policies"]
  }))
  .route({
    method: "DELETE",
    path: "/access-policies/{policyId}",
    operationId: "accessPolicy.removePolicy"
  })
  .input(toStandard(RemovePolicyInputSchema))
  .output(toStandard(S.Struct({ success: S.Boolean, policyId: S.String })))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<AccessPolicyWorkflow>(TOKENS.ACCESS_POLICY_WORKFLOW)
    
    const command = withActorAndWorkspace({
      policyId: input.policyId,
      documentId: input.documentId
    }, context)
    
    await executeEffect(
      workflow.removePolicy(command),
      {
        procedureName: "accessPolicy.removePolicy",
        rpcContext: context
      }
    )
    
    return {
      success: true,
      policyId: input.policyId
    }
  })

export const updatePolicy = os
  .$context<RPCContext>()
  .meta(withWorkspaceHeader({
    summary: "Update access policy",
    description: "Update policy actions",
    tags: ["Access Policies"]
  }))
  .route({
    method: "PATCH",
    path: "/access-policies/{policyId}",
    operationId: "accessPolicy.updatePolicy"
  })
  .input(toStandard(UpdatePolicyActionsInputSchema))
  .output(toStandard(AccessPolicyResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<AccessPolicyWorkflow>(TOKENS.ACCESS_POLICY_WORKFLOW)
    
    const command = withActorAndWorkspace({
      ...input
    }, context)
    
    return await executeEffect(
      workflow.updatePolicyActions(command),
      {
        procedureName: "accessPolicy.updatePolicy",
        rpcContext: context
      }
    )
  })

export const getDocumentPolicies = os
  .$context<RPCContext>()
  .meta(withWorkspaceHeader({
    summary: "Get document policies",
    description: "List all access policies for a document",
    tags: ["Access Policies"]
  }))
  .route({
    method: "GET",
    path: "/documents/{documentId}/access-policies",
    operationId: "accessPolicy.getDocumentPolicies"
  })
  .input(toStandard(GetDocumentPoliciesInputSchema))
  .output(toStandard(S.Array(AccessPolicyResponseSchema)))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<AccessPolicyWorkflow>(TOKENS.ACCESS_POLICY_WORKFLOW)
    
    const query = withActorAndWorkspace({
      documentId: input.documentId
    }, context)
    
    return await executeEffect(
      workflow.getDocumentPolicies(query),
      {
        procedureName: "accessPolicy.getDocumentPolicies",
        rpcContext: context
      }
    )
  })

export const getActorPolicies = os
  .$context<RPCContext>()
  .meta(withWorkspaceHeader({
    summary: "Get actor policies",
    description: "List policies filtered by actor for a document",
    tags: ["Access Policies"]
  }))
  .route({
    method: "GET",
    path: "/documents/{documentId}/access-policies/actors",
    operationId: "accessPolicy.getActorPolicies"
  })
  .input(toStandard(GetActorPoliciesInputSchema))
  .output(toStandard(S.Array(AccessPolicyResponseSchema)))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<AccessPolicyWorkflow>(TOKENS.ACCESS_POLICY_WORKFLOW)
    
    const query = withActorAndWorkspace({
      documentId: input.documentId
    }, context)
    
    return await executeEffect(
      workflow.getActorPolicies(query),
      {
        procedureName: "accessPolicy.getActorPolicies",
        rpcContext: context
      }
    )
  })

export const accessPolicyProcedures = {
  addPolicy,
  removePolicy,
  updatePolicy,
  getDocumentPolicies,
  getActorPolicies
}

