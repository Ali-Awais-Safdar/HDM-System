import { Schema as S } from "effect"
import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { DocumentWorkflow } from "@application/workflow/document.workflow"
import type { RPCContext } from "../context"
import { executeEffect } from "../effect-adapter"
import { withActorAndWorkspace, withActorWorkspaceAndOwner } from "../context"
import { toStandard } from "../standard"
import { normalizeUpdatedAt } from "./utils"

import {
  CreateDocumentInputSchema,
  UpdateDocumentInputSchema,
  PublishDocumentInputSchema,
  DeleteDocumentInputSchema
} from "@application/dto/document/commands.dto"
import {
  GetDocumentInputSchema,
  ListDocumentsInputSchema,
  GetDocumentAccessInputSchema,
  DocumentAccessResponseSchema
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
  .input(toStandard(CreateDocumentInputSchema))
  .output(toStandard(DocumentResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
    
    const command = withActorWorkspaceAndOwner({
      title: input.title,
      description: input.description,
      tags: input.tags ?? []
    }, context)
    
    const result = await executeEffect(
      workflow.createDocument(command),
      {
        procedureName: "document.create",
        rpcContext: context
      }
    )
    
    return normalizeUpdatedAt(result)
  })

export const get = os
  .$context<RPCContext>()
  .input(toStandard(GetDocumentInputSchema))
  .output(toStandard(DocumentResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
    
    const query = withActorAndWorkspace({
      documentId: input.documentId
    }, context)
    
    const result = await executeEffect(
      workflow.getDocument(query),
      {
        procedureName: "document.get",
        rpcContext: context
      }
    )
    
    return normalizeUpdatedAt(result)
  })

export const list = os
  .$context<RPCContext>()
  .input(toStandard(ListDocumentsInputSchema))
  .output(toStandard(PaginatedDocumentsResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
    
    const query = withActorAndWorkspace({
      ownerId: input.ownerId,
      tags: input.tags ?? [],
      search: input.search,
      pageNum: input.pageNum,
      pageSize: input.pageSize
    }, context)
    
    return await executeEffect(
      workflow.listDocuments(query),
      {
        procedureName: "document.list",
        rpcContext: context
      }
    )
  })

export const update = os
  .$context<RPCContext>()
  .input(toStandard(UpdateDocumentInputSchema))
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
      workflow.updateDocument(command),
      {
        procedureName: "document.update",
        rpcContext: context
      }
    )
    
    return normalizeUpdatedAt(result)
  })

export const publish = os
  .$context<RPCContext>()
  .input(toStandard(PublishDocumentInputSchema))
  .output(toStandard(DocumentResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
    
    const command = withActorAndWorkspace({
      documentId: input.documentId,
      publishStatus: input.publishStatus,
      publishNotes: input.publishNotes
    }, context)
    
    const result = await executeEffect(
      workflow.publishDocument(command),
      {
        procedureName: "document.publish",
        rpcContext: context
      }
    )
    
    return normalizeUpdatedAt(result)
  })

export const deleteDoc = os
  .$context<RPCContext>()
  .input(toStandard(DeleteDocumentInputSchema))
  .output(toStandard(S.Struct({ success: S.Boolean, id: S.String })))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
    
    const command = withActorAndWorkspace({
      id: input.id,
      force: input.force
    }, context)
    
    await executeEffect(
      workflow.deleteDocument(command),
      {
        procedureName: "document.delete",
        rpcContext: context
      }
    )
    
    return {
      success: true,
      id: input.id
    }
  })

export const getAccess = os
  .$context<RPCContext>()
  .input(toStandard(GetDocumentAccessInputSchema))
  .output(toStandard(DocumentAccessResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentWorkflow>(TOKENS.DOCUMENT_WORKFLOW)
    
    const query = withActorAndWorkspace({
      documentId: input.documentId,
      requiredPermission: input.requiredPermission
    }, context)
    
    return await executeEffect(
      workflow.getDocumentAccess(query),
      {
        procedureName: "document.getAccess",
        rpcContext: context
      }
    )
  })

export const documentProcedures = {
  create,
  get,
  list,
  update,
  publish,
  delete: deleteDoc,
  getAccess
}

