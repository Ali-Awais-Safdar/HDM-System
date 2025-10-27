import { Effect, Clock } from "effect"
import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { DownloadTokenWorkflow } from "@application/workflow/download-token.workflow"
import type { RPCContext } from "../context"
import { mapToORPCError } from "../error-map"
import { toStandard, toStandardEncoded } from "../standard"

// DTOs
import {
  CreateDownloadTokenCommandSchema,
  type CreateDownloadTokenCommandEncoded,
  ValidateDownloadTokenQuerySchema,
  type ValidateDownloadTokenQueryEncoded,
  ListDownloadTokensQuerySchema,
  type ListDownloadTokensQueryEncoded,
  RevokeDownloadTokenCommandSchema,
  type RevokeDownloadTokenCommandEncoded,
  UseDownloadTokenCommandSchema,
  type UseDownloadTokenCommandEncoded
} from "@application/dto/downloadToken/commands.dto"
import {
  DownloadTokenResponseSchema,
  PaginatedDownloadTokensResponseSchema,
  ValidateDownloadTokenResponseSchema,
  RevokeDownloadTokenResponseSchema
} from "@application/dto/downloadToken/responses.dto"

/**
 * Download Token Procedures
 * 
 * RPC endpoints for download token operations:
 * - create: Issue a new download token
 * - validate: Validate a download token
 * - use: Mark a download token as used
 * - list: List all download tokens for a document
 * - revoke: Revoke a download token
 */

export const create = os
  .$context<RPCContext>()
  .input(toStandard(CreateDownloadTokenCommandSchema))
  .output(toStandardEncoded(DownloadTokenResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DownloadTokenWorkflow>(TOKENS.DOWNLOAD_TOKEN_WORKFLOW)
      
      const command: CreateDownloadTokenCommandEncoded = {
        documentId: input.documentId,
        issuedTo: input.issuedTo,
        expiresAt: input.expiresAt,
        actorId: context.actorId
      }
      
      return await Effect.runPromise(
        Effect.provideService(
          workflow.createDownloadToken(command),
          Clock.Clock,
          Clock.make()
        )
      )
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const validate = os
  .$context<RPCContext>()
  .input(toStandard(ValidateDownloadTokenQuerySchema))
  .output(toStandardEncoded(ValidateDownloadTokenResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DownloadTokenWorkflow>(TOKENS.DOWNLOAD_TOKEN_WORKFLOW)
      
      const query: ValidateDownloadTokenQueryEncoded = {
        token: input.token,
        actorId: context.actorId
      }
      
      return await Effect.runPromise(
        Effect.provideService(
          workflow.validateDownloadToken(query),
          Clock.Clock,
          Clock.make()
        )
      )
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const use = os
  .$context<RPCContext>()
  .input(toStandard(UseDownloadTokenCommandSchema))
  .output(toStandardEncoded(DownloadTokenResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DownloadTokenWorkflow>(TOKENS.DOWNLOAD_TOKEN_WORKFLOW)
      
      const command: UseDownloadTokenCommandEncoded = {
        token: input.token,
        actorId: context.actorId
      }
      
      return await Effect.runPromise(
        Effect.provideService(
          workflow.useDownloadToken(command),
          Clock.Clock,
          Clock.make()
        )
      )
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const list = os
  .$context<RPCContext>()
  .input(toStandard(ListDownloadTokensQuerySchema))
  .output(toStandardEncoded(PaginatedDownloadTokensResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DownloadTokenWorkflow>(TOKENS.DOWNLOAD_TOKEN_WORKFLOW)
      
      const query: ListDownloadTokensQueryEncoded = {
        documentId: input.documentId,
        actorId: context.actorId,
        pageNum: input.pageNum,
        pageSize: input.pageSize
      }
      
      return await Effect.runPromise(
        Effect.provideService(
          workflow.listDownloadTokens(query),
          Clock.Clock,
          Clock.make()
        )
      )
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const revoke = os
  .$context<RPCContext>()
  .input(toStandard(RevokeDownloadTokenCommandSchema))
  .output(toStandardEncoded(RevokeDownloadTokenResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DownloadTokenWorkflow>(TOKENS.DOWNLOAD_TOKEN_WORKFLOW)
      
      const command: RevokeDownloadTokenCommandEncoded = {
        tokenId: input.tokenId,
        actorId: context.actorId
      }
      
      return await Effect.runPromise(
        Effect.provideService(
          workflow.revokeDownloadToken(command),
          Clock.Clock,
          Clock.make()
        )
      )
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const downloadTokenProcedures = {
  create,
  validate,
  use,
  list,
  revoke
}

