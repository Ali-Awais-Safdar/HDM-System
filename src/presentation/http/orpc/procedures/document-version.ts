import { os } from "@orpc/server"
import { resolveWorkflow } from "@infra/di/setup"
import { TOKENS } from "@infra/di/container"
import type { DocumentVersionWorkflow } from "@application/workflow/document-version.workflow"
import type { RPCContext } from "../context"
import { executeEffect } from "../effect-adapter"
import { withActorAndWorkspace } from "../context"
import { toStandard } from "../standard"
import { normalizeUpdatedAt } from "./utils"

import {
  GetDocumentVersionInputSchema,
  ListDocumentVersionsInputSchema,
  GetLatestDocumentVersionInputSchema
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
  .input(toStandard(GetDocumentVersionInputSchema))
  .output(toStandard(DocumentVersionResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentVersionWorkflow>(TOKENS.DOCUMENT_VERSION_WORKFLOW)
    
    const query = withActorAndWorkspace({
      versionId: input.versionId
    }, context)
    
    const result = await executeEffect(
      workflow.getDocumentVersionById(query),
      {
        procedureName: "documentVersion.getById",
        rpcContext: context
      }
    )
    
    return normalizeUpdatedAt(result)
  })

export const getLatest = os
  .$context<RPCContext>()
  .input(toStandard(GetLatestDocumentVersionInputSchema))
  .output(toStandard(LatestDocumentVersionResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentVersionWorkflow>(TOKENS.DOCUMENT_VERSION_WORKFLOW)
    
    const query = withActorAndWorkspace({
      documentId: input.documentId
    }, context)
    
    const result = await executeEffect(
      workflow.getLatestDocumentVersion(query),
      {
        procedureName: "documentVersion.getLatest",
        rpcContext: context
      }
    )
    
    return normalizeUpdatedAt(result)
  })

export const list = os
  .$context<RPCContext>()
  .input(toStandard(ListDocumentVersionsInputSchema))
  .output(toStandard(PaginatedDocumentVersionsResponseSchema))
  .handler(async ({ input, context }) => {
    const workflow = resolveWorkflow<DocumentVersionWorkflow>(TOKENS.DOCUMENT_VERSION_WORKFLOW)
    
    const query = withActorAndWorkspace({
      documentId: input.documentId,
      pageNum: input.pageNum,
      pageSize: input.pageSize
    }, context)
    
    return await executeEffect(
      workflow.listDocumentVersions(query),
      {
        procedureName: "documentVersion.list",
        rpcContext: context
      }
    )
  })

export const documentVersionProcedures = {
  getById,
  getLatest,
  list
}

