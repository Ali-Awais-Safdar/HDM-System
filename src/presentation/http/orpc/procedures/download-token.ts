import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { DownloadTokenWorkflow } from "@application/workflow/download-token.workflow"
import type { RPCContext } from "../context"
import { executeEffect } from "../effect-adapter"
import { withActorAndWorkspace } from "../context"
import { toStandard } from "../standard"
import { mimeToExt, withWorkspaceHeader } from "./utils"

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
  RevokeDownloadTokenResponseSchema,
  DownloadFileDetailedOutputSchema
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
  .meta(withWorkspaceHeader({
    summary: "Create download token",
    description: "Issue a new download token",
    tags: ["Download Tokens"]
  }))
  .route({
    method: "POST",
    path: "/documents/{documentId}/download-tokens",
    operationId: "downloadToken.create"
  })
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
  .meta(withWorkspaceHeader({
    summary: "Validate download token",
    description: "Validate a download token",
    tags: ["Download Tokens"]
  }))
  .route({
    method: "GET",
    path: "/download-tokens/{token}",
    operationId: "downloadToken.validate"
  })
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
  .meta(withWorkspaceHeader({
    summary: "Use download token",
    description: "Mark a download token as used",
    tags: ["Download Tokens"]
  }))
  .route({
    method: "POST",
    path: "/download-tokens/{token}/use",
    operationId: "downloadToken.use"
  })
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
  .meta(withWorkspaceHeader({
    summary: "List download tokens",
    description: "List all download tokens for a document",
    tags: ["Download Tokens"]
  }))
  .route({
    method: "GET",
    path: "/documents/{documentId}/download-tokens",
    operationId: "downloadToken.list"
  })
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
  .meta(withWorkspaceHeader({
    summary: "Revoke download token",
    description: "Revoke a download token",
    tags: ["Download Tokens"]
  }))
  .route({
    method: "DELETE",
    path: "/download-tokens/{tokenId}",
    operationId: "downloadToken.revoke"
  })
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
  .meta(withWorkspaceHeader({
    summary: "Download file",
    description: "Download file using a validated token",
    tags: ["Download Tokens"]
  }))
  .route({
    method: "GET",
    path: "/download-tokens/{token}/file",
    operationId: "downloadToken.downloadFile",
    outputStructure: "detailed"
  })
  .input(toStandard(DownloadFileWithTokenInputSchema))
  .output(toStandard(DownloadFileDetailedOutputSchema))
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
    
    const blob = await new Response(stream).blob()
    
    return {
      headers: {
        "Content-Type": metadata.mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Checksum": metadata.checksum,
        "Cache-Control": "no-cache, no-store, must-revalidate"
      },
      body: blob
    }
  })

export const downloadTokenProcedures = {
  create,
  validate,
  use,
  list,
  revoke,
  downloadFile
}