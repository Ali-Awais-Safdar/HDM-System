import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { DownloadTokenWorkflow } from "@application/workflow/download-token.workflow"
import type { RPCContext } from "../context"
import { executeEffect } from "../effect-adapter"
import { withActorAndWorkspace } from "../context"
import { toStandard } from "../standard"
import { mimeToExt } from "./utils"

import {
  CreateDownloadTokenInputSchema,
  ValidateDownloadTokenInputSchema,
  UseDownloadTokenInputSchema,
  ListDownloadTokensInputSchema,
  RevokeDownloadTokenInputSchema,
  DownloadFileWithTokenInputSchema
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
 * - downloadFile: Download file using a validated token (streams file directly)
 */

export const create = os
  .$context<RPCContext>()
  .input(toStandard(CreateDownloadTokenInputSchema))
  .output(toStandard(DownloadTokenResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DownloadTokenWorkflow>(TOKENS.DOWNLOAD_TOKEN_WORKFLOW)
    
    const command = withActorAndWorkspace({
      documentId: input.documentId,
      issuedTo: input.issuedTo,
      expiresAt: input.expiresAt
    }, context)
    
    return await executeEffect(
      workflow.createDownloadToken(command),
      {
        procedureName: "downloadToken.create",
        rpcContext: context
      }
    )
  })

export const validate = os
  .$context<RPCContext>()
  .input(toStandard(ValidateDownloadTokenInputSchema))
  .output(toStandard(ValidateDownloadTokenResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DownloadTokenWorkflow>(TOKENS.DOWNLOAD_TOKEN_WORKFLOW)
    
    const query = withActorAndWorkspace({
      token: input.token
    }, context)
    
    return await executeEffect(
      workflow.validateDownloadToken(query),
      {
        procedureName: "downloadToken.validate",
        rpcContext: context
      }
    )
  })

export const use = os
  .$context<RPCContext>()
  .input(toStandard(UseDownloadTokenInputSchema))
  .output(toStandard(DownloadTokenResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DownloadTokenWorkflow>(TOKENS.DOWNLOAD_TOKEN_WORKFLOW)
    
    const command = withActorAndWorkspace({
      token: input.token
    }, context)
    
    return await executeEffect(
      workflow.useDownloadToken(command),
      {
        procedureName: "downloadToken.use",
        rpcContext: context
      }
    )
  })

export const list = os
  .$context<RPCContext>()
  .input(toStandard(ListDownloadTokensInputSchema))
  .output(toStandard(PaginatedDownloadTokensResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DownloadTokenWorkflow>(TOKENS.DOWNLOAD_TOKEN_WORKFLOW)
    
    const query = withActorAndWorkspace({
      documentId: input.documentId,
      pageNum: input.pageNum,
      pageSize: input.pageSize
    }, context)
    
    return await executeEffect(
      workflow.listDownloadTokens(query),
      {
        procedureName: "downloadToken.list",
        rpcContext: context
      }
    )
  })

export const revoke = os
  .$context<RPCContext>()
  .input(toStandard(RevokeDownloadTokenInputSchema))
  .output(toStandard(RevokeDownloadTokenResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DownloadTokenWorkflow>(TOKENS.DOWNLOAD_TOKEN_WORKFLOW)
    
    const command = withActorAndWorkspace({
      tokenId: input.tokenId
    }, context)
    
    return await executeEffect(
      workflow.revokeDownloadToken(command),
      {
        procedureName: "downloadToken.revoke",
        rpcContext: context
      }
    )
  })

/**
 * Download file using a validated download token.
 * 
 * This procedure:
 * 1. Validates the download token
 * 2. Marks the token as used
 * 3. Retrieves the file from storage
 * 4. Streams the file to the client with appropriate headers including filename and checksum
 * 
 * Returns a Response with file stream and metadata headers.
 */
export const downloadFile = os
  .$context<RPCContext>()
  .input(toStandard(DownloadFileWithTokenInputSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DownloadTokenWorkflow>(TOKENS.DOWNLOAD_TOKEN_WORKFLOW)
    
    const command = withActorAndWorkspace({
      token: input.token
    }, context)
    
    // Execute workflow and get file stream with metadata
    const result = await executeEffect(
      workflow.downloadFileWithToken(command),
      {
        procedureName: "downloadToken.downloadFile",
        rpcContext: context
      }
    )
    
    // Extract stream and metadata
    const { stream, metadata } = result.stream
    
    // Generate filename: use originalFilename if available, otherwise create deterministic name
    const filename =
      metadata.originalFilename ??
      `document-${result.documentId}-v${result.version}${mimeToExt(metadata.mimeType)}`
    
    // Create Response with appropriate headers including checksum for integrity verification
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": metadata.mimeType,
        "Content-Length": metadata.size.toString(),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Checksum": metadata.checksum,
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    })
  })

export const downloadTokenProcedures = {
  create,
  validate,
  use,
  list,
  revoke,
  downloadFile
}

