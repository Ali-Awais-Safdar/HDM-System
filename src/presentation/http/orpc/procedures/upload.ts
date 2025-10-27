import { Effect, Clock } from "effect"
import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { UploadWorkflow } from "@application/workflow/upload.workflow"
import type { RPCContext } from "../context"
import { mapToORPCError } from "../error-map"
import { toStandard, toStandardEncoded } from "../standard"
import { normalizeUploadResponse } from "./utils"

// DTOs
import {
  InitiateUploadCommandSchema,
  type InitiateUploadCommandEncoded,
  ConfirmUploadCommandSchema,
  type ConfirmUploadCommandEncoded,
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
  .output(toStandardEncoded(InitiateUploadResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<UploadWorkflow>(TOKENS.UPLOAD_WORKFLOW)

      const command: InitiateUploadCommandEncoded = {
        documentId: input.documentId,
        actorId: input.actorId ?? context.actorId,
        mimeType: input.mimeType,
        size: input.size,
        contentRef: input.contentRef,
        checksum: input.checksum
      }

      return await Effect.runPromise(
        Effect.provideService(
          workflow.initiateUpload(command),
          Clock.Clock,
          Clock.make()
        )
      )
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const confirmUpload = os
  .$context<RPCContext>()
  .input(toStandard(ConfirmUploadCommandSchema))
  .output(toStandardEncoded(ConfirmUploadResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<UploadWorkflow>(TOKENS.UPLOAD_WORKFLOW)

      const command: ConfirmUploadCommandEncoded = {
        documentId: input.documentId,
        actorId: input.actorId ?? context.actorId,
        fileKey: input.fileKey,
        checksum: input.checksum,
        mimeType: input.mimeType,
        size: input.size,
        contentRef: input.contentRef,
        versionHint: input.versionHint
      }

      const result = await Effect.runPromise(
        Effect.provideService(
          workflow.confirmUpload(command),
          Clock.Clock,
          Clock.make()
        )
      )

      return normalizeUploadResponse(result)
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const uploadProcedures = {
  initiateUpload,
  confirmUpload
}

