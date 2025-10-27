import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { DocumentVersionWorkflow } from "@application/workflow/document-version.workflow"
import type { RPCContext } from "../context"
import { executeEffect } from "../effect-adapter"
import { withActorAndWorkspace } from "../context"
import { toStandard } from "../standard"
import { normalizeUpdatedAt } from "./utils"

// DTOs
import {
  GetDocumentVersionQuerySchema,
  ListDocumentVersionsQuerySchema,
  GetLatestDocumentVersionQuerySchema
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
  .output(toStandard(DocumentVersionResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentVersionWorkflow>(TOKENS.DOCUMENT_VERSION_WORKFLOW)
    
    const query = withActorAndWorkspace({
      versionId: input.versionId
    }, context)
    
    const result = await executeEffect(
      workflow.getDocumentVersionById(query)
    )
    
    return normalizeUpdatedAt(result)
  })

export const getLatest = os
  .$context<RPCContext>()
  .input(toStandard(GetLatestDocumentVersionQuerySchema))
  .output(toStandard(LatestDocumentVersionResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentVersionWorkflow>(TOKENS.DOCUMENT_VERSION_WORKFLOW)
    
    const query = withActorAndWorkspace({
      documentId: input.documentId
    }, context)
    
    const result = await executeEffect(
      workflow.getLatestDocumentVersion(query)
    )
    
    return normalizeUpdatedAt(result)
  })

export const list = os
  .$context<RPCContext>()
  .input(toStandard(ListDocumentVersionsQuerySchema))
  .output(toStandard(PaginatedDocumentVersionsResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentVersionWorkflow>(TOKENS.DOCUMENT_VERSION_WORKFLOW)
    
    const query = withActorAndWorkspace({
      documentId: input.documentId,
      pageNum: input.pageNum,
      pageSize: input.pageSize
    }, context)
    
    return await executeEffect(
      workflow.listDocumentVersions(query)
    )
  })

export const documentVersionProcedures = {
  getById,
  getLatest,
  list
}

