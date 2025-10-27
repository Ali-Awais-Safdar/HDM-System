import { Effect, Clock, Schema as S } from "effect"
import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { AccessPolicyWorkflow } from "@application/workflow/access-policy.workflow"
import type { RPCContext } from "../context"
import { mapToORPCError } from "../error-map"
import { toStandard, toStandardEncoded } from "../standard"

// DTOs
import {
  AddPolicyCommandSchema,
  type AddPolicyCommandEncoded,
  RemovePolicyCommandSchema,
  type RemovePolicyCommandEncoded,
  UpdatePolicyActionsCommandSchema,
  type UpdatePolicyActionsCommandEncoded
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
  .output(toStandardEncoded(AccessPolicyResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<AccessPolicyWorkflow>(TOKENS.ACCESS_POLICY_WORKFLOW)
      
      const command: AddPolicyCommandEncoded = {
        ...input,
        actorId: context.actorId
      }
      
      return await Effect.runPromise(
        Effect.provideService(
          workflow.addPolicy(command),
          Clock.Clock,
          Clock.make()
        )
      )
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const removePolicy = os
  .$context<RPCContext>()
  .input(toStandard(RemovePolicyCommandSchema))
  .output(toStandardEncoded(S.Struct({ success: S.Boolean, policyId: S.String })))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<AccessPolicyWorkflow>(TOKENS.ACCESS_POLICY_WORKFLOW)
      
      const command: RemovePolicyCommandEncoded = {
        policyId: input.policyId,
        documentId: input.documentId,
        actorId: context.actorId
      }
      
      await Effect.runPromise(
        Effect.provideService(
          workflow.removePolicy(command),
          Clock.Clock,
          Clock.make()
        )
      )
      
      return {
        success: true,
        policyId: input.policyId
      }
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const updatePolicy = os
  .$context<RPCContext>()
  .input(toStandard(UpdatePolicyActionsCommandSchema))
  .output(toStandardEncoded(AccessPolicyResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<AccessPolicyWorkflow>(TOKENS.ACCESS_POLICY_WORKFLOW)
      
      const command: UpdatePolicyActionsCommandEncoded = {
        ...input,
        actorId: context.actorId
      }
      
      return await Effect.runPromise(
        Effect.provideService(
          workflow.updatePolicyActions(command),
          Clock.Clock,
          Clock.make()
        )
      )
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const accessPolicyProcedures = {
  addPolicy,
  removePolicy,
  updatePolicy
}

