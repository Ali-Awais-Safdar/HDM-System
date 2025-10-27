import { Effect, Schema as S, Clock } from "effect"
import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { DocumentWorkflow } from "@application/workflow/document.workflow"
import type { RPCContext } from "../context"
import { mapToORPCError } from "../error-map"
import { toStandard, toStandardEncoded } from "../standard"
import { normalizeUpdatedAt } from "./utils"

// DTOs
import {
  CreateDocumentCommandSchema,
  type CreateDocumentCommandEncoded,
  UpdateDocumentCommandSchema,
  type UpdateDocumentCommandEncoded,
  PublishDocumentCommandSchema,
  type PublishDocumentCommandEncoded,
  DeleteDocumentCommandSchema,
  type DeleteDocumentCommandEncoded
} from "@application/dto/document/commands.dto"
import {
  GetDocumentQuerySchema,
  type GetDocumentQueryEncoded,
  ListDocumentsQuerySchema,
  type ListDocumentsQueryEncoded
} from "@application/dto/document/queries.dto"
import {
  DocumentResponseSchema,
  PaginatedDocumentsResponseSchema
} from "@application/dto/document/responses.dto"

/**
 * Document Procedures
 * 
 * RPC endpoints for document CRUD operations:
 * - create: Create a new document
 * - get: Retrieve a document by ID
 * - list: List documents with filters and pagination
 * - update: Update document metadata
 * - publish: Change document publish status
 * - delete: Delete a document
 */

export const create = os
  .$context<RPCContext>()
  .input(toStandard(CreateDocumentCommandSchema))
  .output(toStandardEncoded(DocumentResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
      
      const command: CreateDocumentCommandEncoded = {
        ownerId: input.ownerId ?? context.actorId,
        title: input.title,
        description: input.description,
        tags: input.tags
      }
      
      const result = await Effect.runPromise(
        Effect.provideService(
          workflow.createDocument(command),
          Clock.Clock,
          Clock.make()
        )
      )
      
      return normalizeUpdatedAt(result)
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const get = os
  .$context<RPCContext>()
  .input(toStandard(GetDocumentQuerySchema))
  .output(toStandardEncoded(DocumentResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
      
      const query: GetDocumentQueryEncoded = {
        documentId: input.documentId,
        actorId: context.actorId
      }
      
      const result = await Effect.runPromise(
        Effect.provideService(
          workflow.getDocument(query),
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
  .input(toStandard(ListDocumentsQuerySchema))
  .output(toStandardEncoded(PaginatedDocumentsResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
      
      const query: ListDocumentsQueryEncoded = {
        actorId: context.actorId,
        ownerId: input.ownerId,
        tags: input.tags,
        search: input.search,
        pageNum: input.pageNum,
        pageSize: input.pageSize
      }
      
      return await Effect.runPromise(
        Effect.provideService(
          workflow.listDocuments(query),
          Clock.Clock,
          Clock.make()
        )
      )
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const update = os
  .$context<RPCContext>()
  .input(toStandard(UpdateDocumentCommandSchema))
  .output(toStandardEncoded(DocumentResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
      
      const command: UpdateDocumentCommandEncoded = {
        id: input.id,
        actorId: context.actorId,
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.tags !== undefined && { tags: input.tags })
      }
      
      const result = await Effect.runPromise(
        Effect.provideService(
          workflow.updateDocument(command),
          Clock.Clock,
          Clock.make()
        )
      )
      
      return normalizeUpdatedAt(result)
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const publish = os
  .$context<RPCContext>()
  .input(toStandard(PublishDocumentCommandSchema))
  .output(toStandardEncoded(DocumentResponseSchema))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
      
      const command: PublishDocumentCommandEncoded = {
        documentId: input.documentId,
        actorId: context.actorId,
        publishStatus: input.publishStatus,
        publishNotes: input.publishNotes
      }
      
      const result = await Effect.runPromise(
        Effect.provideService(
          workflow.publishDocument(command),
          Clock.Clock,
          Clock.make()
        )
      )
      
      return normalizeUpdatedAt(result)
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const deleteDoc = os
  .$context<RPCContext>()
  .input(toStandard(DeleteDocumentCommandSchema))
  .output(toStandardEncoded(S.Struct({ success: S.Boolean, id: S.String })))
  .handler(async ({ input, context }) => {
    try {
      const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
      
      const command: DeleteDocumentCommandEncoded = {
        id: input.id,
        actorId: context.actorId,
        force: input.force
      }
      
      await Effect.runPromise(
        Effect.provideService(
          workflow.deleteDocument(command),
          Clock.Clock,
          Clock.make()
        )
      )
      
      return {
        success: true,
        id: input.id
      }
    } catch (error) {
      throw mapToORPCError(error)
    }
  })

export const documentProcedures = {
  create,
  get,
  list,
  update,
  publish,
  delete: deleteDoc
}

