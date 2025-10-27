import { Effect, Clock } from "effect"
import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { DocumentVersionWorkflow } from "@application/workflow/document-version.workflow"
import type { RPCContext } from "../context"
import { mapToORPCError } from "../error-map"
import { toStandard, toStandardEncoded } from "../standard"
import { normalizeUpdatedAt } from "./utils"

// DTOs
import {
  GetDocumentVersionQuerySchema,
  type GetDocumentVersionQueryEncoded,
  ListDocumentVersionsQuerySchema,
  type ListDocumentVersionsQueryEncoded,
  GetLatestDocumentVersionQuerySchema,
  type GetLatestDocumentVersionQueryEncoded
} from "@application/dto/documentVersion/commands.dto"
import {
  DocumentVersionResponseSchema,
  PaginatedDocumentVersionsResponseSchema,
  LatestDocumentVersionResponseSchema
} from "@application/dto/documentVersion/responses.dto"

/**
 * Document Version Procedures
 * 
 * RPC endpoints for document version operations:
 * - getById: Retrieve a specific version by ID
 * - getLatest: Retrieve the latest version of a document
 * - list: List all versions of a document with pagination
 */

export const getById = os
  .$context<RPCContext>()
  .input(toStandard(GetDocumentVersionQuerySchema))
  .output(toStandardEncoded(DocumentVersionResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DocumentVersionWorkflow>(TOKENS.DOCUMENT_VERSION_WORKFLOW)
      
      const query: GetDocumentVersionQueryEncoded = {
        versionId: input.versionId,
        actorId: context.actorId
      }
      
      const result = await Effect.runPromise(
        Effect.provideService(
          workflow.getDocumentVersionById(query),
          Clock.Clock,
          Clock.make()
        )
      )
      
      return normalizeUpdatedAt(result)
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const getLatest = os
  .$context<RPCContext>()
  .input(toStandard(GetLatestDocumentVersionQuerySchema))
  .output(toStandardEncoded(LatestDocumentVersionResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DocumentVersionWorkflow>(TOKENS.DOCUMENT_VERSION_WORKFLOW)
      
      const query: GetLatestDocumentVersionQueryEncoded = {
        documentId: input.documentId,
        actorId: context.actorId
      }
      
      const result = await Effect.runPromise(
        Effect.provideService(
          workflow.getLatestDocumentVersion(query),
          Clock.Clock,
          Clock.make()
        )
      )
      
      return normalizeUpdatedAt(result)
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const list = os
  .$context<RPCContext>()
  .input(toStandard(ListDocumentVersionsQuerySchema))
  .output(toStandardEncoded(PaginatedDocumentVersionsResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DocumentVersionWorkflow>(TOKENS.DOCUMENT_VERSION_WORKFLOW)
      
      const query: ListDocumentVersionsQueryEncoded = {
        documentId: input.documentId,
        actorId: context.actorId,
        pageNum: input.pageNum,
        pageSize: input.pageSize
      }
      
      return await Effect.runPromise(
        Effect.provideService(
          workflow.listDocumentVersions(query),
          Clock.Clock,
          Clock.make()
        )
      )
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const documentVersionProcedures = {
  getById,
  getLatest,
  list
}

