import { Schema as S } from "effect"
import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { DocumentWorkflow } from "@application/workflow/document.workflow"
import type { RPCContext } from "../context"
import { executeEffect } from "../effect-adapter"
import { withActorAndWorkspace } from "../context"
import { toStandard } from "../standard"
import { normalizeUpdatedAt } from "./utils"

// DTOs
import {
  CreateDocumentCommandSchema,
  UpdateDocumentCommandSchema,
  PublishDocumentCommandSchema,
  DeleteDocumentCommandSchema
} from "@application/dto/document/commands.dto"
import {
  GetDocumentQuerySchema,
  ListDocumentsQuerySchema
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
  .output(toStandard(DocumentResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
    
    const command = withActorAndWorkspace({
      ownerId: input.ownerId,
      title: input.title,
      description: input.description,
      tags: input.tags
    }, context)
    
    const result = await executeEffect(
      workflow.createDocument(command)
    )
    
    return normalizeUpdatedAt(result)
  })

export const get = os
  .$context<RPCContext>()
  .input(toStandard(GetDocumentQuerySchema))
  .output(toStandard(DocumentResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
    
    const query = withActorAndWorkspace({
      documentId: input.documentId
    }, context)
    
    const result = await executeEffect(
      workflow.getDocument(query)
    )
    
    return normalizeUpdatedAt(result)
  })

export const list = os
  .$context<RPCContext>()
  .input(toStandard(ListDocumentsQuerySchema))
  .output(toStandard(PaginatedDocumentsResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
    
    const query = withActorAndWorkspace({
      ownerId: input.ownerId,
      tags: input.tags,
      search: input.search,
      pageNum: input.pageNum,
      pageSize: input.pageSize
    }, context)
    
    return await executeEffect(
      workflow.listDocuments(query)
    )
  })

export const update = os
  .$context<RPCContext>()
  .input(toStandard(UpdateDocumentCommandSchema))
  .output(toStandard(DocumentResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
    
    const command = withActorAndWorkspace({
      id: input.id,
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.tags !== undefined && { tags: input.tags })
    }, context)
    
    const result = await executeEffect(
      workflow.updateDocument(command)
    )
    
    return normalizeUpdatedAt(result)
  })

export const publish = os
  .$context<RPCContext>()
  .input(toStandard(PublishDocumentCommandSchema))
  .output(toStandard(DocumentResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
    
    const command = withActorAndWorkspace({
      documentId: input.documentId,
      publishStatus: input.publishStatus,
      publishNotes: input.publishNotes
    }, context)
    
    const result = await executeEffect(
      workflow.publishDocument(command)
    )
    
    return normalizeUpdatedAt(result)
  })

export const deleteDoc = os
  .$context<RPCContext>()
  .input(toStandard(DeleteDocumentCommandSchema))
  .output(toStandard(S.Struct({ success: S.Boolean, id: S.String })))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
    
    const command = withActorAndWorkspace({
      id: input.id,
      force: input.force
    }, context)
    
    await executeEffect(
      workflow.deleteDocument(command)
    )
    
    return {
      success: true,
      id: input.id
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

