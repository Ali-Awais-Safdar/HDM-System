import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { UploadWorkflow } from "@application/workflow/upload.workflow"
import type { RPCContext } from "../context"
import { executeEffect } from "../effect-adapter"
import { withActorAndWorkspace } from "../context"
import { toStandard } from "../standard"
import { normalizeUploadResponse, withWorkspaceHeader } from "./utils"

import {
  InitiateUploadFormSchema,
  ConfirmUploadInputSchema
} from "@application/dto/document/commands.dto"
import {
  InitiateUploadResponseSchema,
  ConfirmUploadResponseSchema
} from "@application/dto/document/responses.dto"

/**
 * Upload Procedures
 *
 * RPC endpoints for file upload operations:
 * - initiateUpload: Direct file upload with streaming via multipart form data
 * - confirmUpload: Confirms upload and creates document version
 */

export const initiateUpload = os
  .$context<RPCContext>()
  .meta(withWorkspaceHeader({
    summary: "Initiate upload",
    description: "Initiate a file upload with multipart/form-data",
    tags: ["Uploads"]
  }))
  .route({
    method: "POST",
    path: "/documents/{documentId}/uploads",
    operationId: "upload.initiateUpload"
  })
  .input(toStandard(InitiateUploadFormSchema))
  .output(toStandard(InitiateUploadResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<UploadWorkflow>(TOKENS.UPLOAD_WORKFLOW)

    // Extract File instance and metadata from multipart form data
    const { file, documentId, mimeType, size, contentRef, checksum } = input

    // Convert File to ReadableStream for workflow processing
    const stream = file.stream() as ReadableStream<Uint8Array>

    // Build command with metadata and stream
    const command = withActorAndWorkspace(
      {
        documentId,
        mimeType,
        size,
        contentRef,
        checksum,
        stream
      },
      context
    )

    return await executeEffect(
      workflow.initiateUpload(command),
      {
        procedureName: "upload.initiateUpload",
        rpcContext: context
      }
    )
  })

export const confirmUpload = os
  .$context<RPCContext>()
  .meta(withWorkspaceHeader({
    summary: "Confirm upload",
    description: "Confirm upload and create document version",
    tags: ["Uploads"]
  }))
  .route({
    method: "POST",
    path: "/documents/{documentId}/uploads/confirm",
    operationId: "upload.confirmUpload"
  })
  .input(toStandard(ConfirmUploadInputSchema))
  .output(toStandard(ConfirmUploadResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<UploadWorkflow>(TOKENS.UPLOAD_WORKFLOW)

    const command = withActorAndWorkspace({
      documentId: input.documentId,
      fileKey: input.fileKey,
      checksum: input.checksum,
      mimeType: input.mimeType,
      size: input.size,
      contentRef: input.contentRef,
      versionHint: input.versionHint
    }, context)

    const result = await executeEffect(
      workflow.confirmUpload(command),
      {
        procedureName: "upload.confirmUpload",
        rpcContext: context
      }
    )
    
    return normalizeUploadResponse(result)
  })

export const uploadProcedures = {
  initiateUpload,
  confirmUpload
}

