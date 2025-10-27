import { Schema as S } from "effect"
import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { AccessPolicyWorkflow } from "@application/workflow/access-policy.workflow"
import type { RPCContext } from "../context"
import { executeEffect } from "../effect-adapter"
import { withActorAndWorkspace } from "../context"
import { toStandard } from "../standard"

// DTOs
import {
  AddPolicyCommandSchema,
  RemovePolicyCommandSchema,
  UpdatePolicyActionsCommandSchema
} from "@application/dto/accessPolicy/commands.dto"
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
 */

export const addPolicy = os
  .$context<RPCContext>()
  .input(toStandard(AddPolicyCommandSchema))
  .output(toStandard(AccessPolicyResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<AccessPolicyWorkflow>(TOKENS.ACCESS_POLICY_WORKFLOW)
    
    const command = withActorAndWorkspace({
      ...input
    }, context)
    
    return await executeEffect(
      workflow.addPolicy(command)
    )
  })

export const removePolicy = os
  .$context<RPCContext>()
  .input(toStandard(RemovePolicyCommandSchema))
  .output(toStandard(S.Struct({ success: S.Boolean, policyId: S.String })))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<AccessPolicyWorkflow>(TOKENS.ACCESS_POLICY_WORKFLOW)
    
    const command = withActorAndWorkspace({
      policyId: input.policyId,
      documentId: input.documentId
    }, context)
    
    await executeEffect(
      workflow.removePolicy(command)
    )
    
    return {
      success: true,
      policyId: input.policyId
    }
  })

export const updatePolicy = os
  .$context<RPCContext>()
  .input(toStandard(UpdatePolicyActionsCommandSchema))
  .output(toStandard(AccessPolicyResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<AccessPolicyWorkflow>(TOKENS.ACCESS_POLICY_WORKFLOW)
    
    const command = withActorAndWorkspace({
      ...input
    }, context)
    
    return await executeEffect(
      workflow.updatePolicyActions(command)
    )
  })

export const accessPolicyProcedures = {
  addPolicy,
  removePolicy,
  updatePolicy
}

