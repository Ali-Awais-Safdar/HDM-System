import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { UserWorkflow } from "@application/workflow/user.workflow"
import type { RPCContext, AnonymousRPCContext } from "../context"
import { executeEffect, executeEffectAnonymous } from "../effect-adapter"
import { withActor, withAnonymousContext } from "../context"
import { toStandard } from "../standard"
import { normalizeUpdatedAt } from "./utils"

import { Schema as S } from "effect"
import {
  SignUpInputSchema,
  LoginInputSchema,
  ChangePasswordInputSchema
} from "@application/dto/user/commands.dto"
import {
  SignUpResponseSchema,
  LoginResponseSchema,
  ChangePasswordResponseSchema,
  UserSummarySchema
} from "@application/dto/user/responses.dto"

/**
 * User Procedures
 * 
 * RPC endpoints for user operations:
 * - signUp: Register a new user (unauthenticated)
 * - login: Authenticate and generate session (unauthenticated)
 * - changePassword: Change user password (authenticated)
 * - getProfile: Get user profile (authenticated)
 */

export const signUp = os
  .$context<AnonymousRPCContext>()
  .meta({
    summary: "Sign up",
    description: "Register a new user",
    tags: ["Auth"],
    security: []
  })
  .route({
    method: "POST",
    path: "/user/signUp",
    operationId: "user.signUp",
    spec: (op) => ({ ...op, security: [] })
  })
  .input(toStandard(SignUpInputSchema))
  .output(toStandard(SignUpResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<UserWorkflow>(TOKENS.USER_WORKFLOW)
    
    const command = withAnonymousContext({
      email: input.email,
      password: input.password,
      roles: input.roles
    }, context)
    
    const result = await executeEffectAnonymous(
      workflow.signUp(command),
      {
        procedureName: "user.signUp",
        rpcContext: context
      }
    )
    
    // Normalize updatedAt for user if present
    if (result.user.updatedAt !== undefined) {
      return {
        ...result,
        user: normalizeUpdatedAt(result.user)
      }
    }
    
    return result
  })

export const login = os
  .$context<AnonymousRPCContext>()
  .meta({
    summary: "Login",
    description: "Authenticate and generate session",
    tags: ["Auth"],
    security: []
  })
  .route({
    method: "POST",
    path: "/user/login",
    operationId: "user.login",
    spec: (op) => ({ ...op, security: [] })
  })
  .input(toStandard(LoginInputSchema))
  .output(toStandard(LoginResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<UserWorkflow>(TOKENS.USER_WORKFLOW)
    
    const query = withAnonymousContext({
      email: input.email,
      password: input.password
    }, context)
    
    const result = await executeEffectAnonymous(
      workflow.login(query),
      {
        procedureName: "user.login",
        rpcContext: context
      }
    )
    
    // Normalize updatedAt for user
    if (result.user.updatedAt !== undefined) {
      return {
        ...result,
        user: normalizeUpdatedAt(result.user)
      }
    }
    
    return result
  })

export const changePassword = os
  .$context<RPCContext>()
  .meta({
    summary: "Change password",
    description: "Change user password",
    tags: ["Users"]
  })
  .route({
    method: "POST",
    path: "/users/me/change-password",
    operationId: "user.changePassword"
  })
  .input(toStandard(ChangePasswordInputSchema))
  .output(toStandard(ChangePasswordResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<UserWorkflow>(TOKENS.USER_WORKFLOW)
    
    const command = withActor({
      userId: context.actorId, // Target user is the authenticated actor
      oldPassword: input.oldPassword,
      newPassword: input.newPassword
    }, context)
    
    return await executeEffect(
      workflow.changePassword(command),
      {
        procedureName: "user.changePassword",
        rpcContext: context
      }
    )
  })

export const getProfile = os
  .$context<RPCContext>()
  .meta({
    summary: "Get profile",
    description: "Get user profile",
    tags: ["Users"]
  })
  .route({
    method: "GET",
    path: "/users/me",
    operationId: "user.getProfile"
  })
  .input(toStandard(S.Struct({}).annotations({ jsonSchema: { type: "object" } })))
  .output(toStandard(UserSummarySchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<UserWorkflow>(TOKENS.USER_WORKFLOW)
    
    const query = {
      ...input,
      actorId: context.actorId
    }
    
    const result = await executeEffect(
      workflow.getProfile(query),
      {
        procedureName: "user.getProfile",
        rpcContext: context
      }
    )
    
    // Normalize updatedAt if present
    if (result.updatedAt !== undefined) {
      return normalizeUpdatedAt(result)
    }
    
    return result
  })

export const userProcedures = {
  signUp,
  login,
  changePassword,
  getProfile
}

