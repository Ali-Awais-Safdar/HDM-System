import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { UploadWorkflow } from "@application/workflow/upload.workflow"
import type { RPCContext } from "../context"
import { executeEffect } from "../effect-adapter"
import { withActorAndWorkspace } from "../context"
import { toStandard } from "../standard"
import { normalizeUploadResponse } from "./utils"

// DTOs
import {
  InitiateUploadCommandSchema,
  ConfirmUploadCommandSchema,
  InitiateUploadResponseSchema,
  ConfirmUploadResponseSchema
} from "@application/dto/document/commands.dto"

/**
 * Upload Procedures
 *
 * RPC endpoints for file upload operations:
 * - initiateUpload: Generates pre-signed upload URL
 * - confirmUpload: Confirms upload and creates document version
 */

export const initiateUpload = os
  .$context<RPCContext>()
  .input(toStandard(InitiateUploadCommandSchema))
  .output(toStandard(InitiateUploadResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<UploadWorkflow>(TOKENS.UPLOAD_WORKFLOW)

    const command = withActorAndWorkspace({
      documentId: input.documentId,
      mimeType: input.mimeType,
      size: input.size,
      contentRef: input.contentRef,
      checksum: input.checksum
    }, context)

    return await executeEffect(
      workflow.initiateUpload(command)
    )
  })

export const confirmUpload = os
  .$context<RPCContext>()
  .input(toStandard(ConfirmUploadCommandSchema))
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
      workflow.confirmUpload(command)
    )

    return normalizeUploadResponse(result)
  })

export const uploadProcedures = {
  initiateUpload,
  confirmUpload
}

