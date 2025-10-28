import { Schema as S } from "effect"
import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { AccessPolicyWorkflow } from "@application/workflow/access-policy.workflow"
import type { RPCContext } from "../context"
import { executeEffect } from "../effect-adapter"
import { withActorAndWorkspace } from "../context"
import { toStandard } from "../standard"

import {
  AddPolicyInputSchema,
  RemovePolicyInputSchema,
  UpdatePolicyActionsInputSchema
} from "@application/dto/accessPolicy/commands.dto"
import {
  GetDocumentPoliciesInputSchema,
  GetActorPoliciesInputSchema
} from "@application/dto/accessPolicy/queries.dto"
import {
  AccessPolicyResponseSchema
} from "@application/dto/accessPolicy/responses.dto"

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

