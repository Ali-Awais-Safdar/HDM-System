import { Effect } from "effect"
import { DocumentEntity } from "../entities/document.entity"
import { DocumentAccessPolicy, DocumentAccessContext } from "../policies/document-access.policy"
import { AccessPolicyEntity } from "../entities/access-policy.entity"
import { DocumentId, UserId } from "../value-objects/id.vo"
import { Role } from "../schema/access-policy.schema"
import { DocumentRepository } from "../ports/document.repository"
import { DocumentNotFoundError, DocumentValidationError } from "../errors/document.errors"
import { ValidationError, BusinessRuleViolationError, DomainError } from "../errors/domain.errors"

export type DocumentServiceErrorCode = 
  | "ACCESS_DENIED" 
  | "NOT_FOUND" 
  | "STORAGE_ERROR" 
  | "UNKNOWN_ERROR"

export class DocumentServiceError extends DomainError {
  readonly _tag = "DocumentServiceError" as const
  
  constructor(
    message: string,
    public readonly code: DocumentServiceErrorCode = "UNKNOWN_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message, { code, ...details })
  }
}

export class DocumentService {
  constructor(
    private readonly documentRepository: DocumentRepository
  ) {}

  createDocument(
    ownerId: UserId,
    title: string,
    currentVersionId: any,
    description?: string | null,
    tags?: string[] | null
  ): Effect.Effect<
    DocumentEntity, 
    DocumentValidationError | ValidationError
  > {
    const docData: any = {
      id: crypto.randomUUID(),
      ownerId,
      title,
      currentVersionId
    }
    
    if (description !== undefined && description !== null) {
      docData.description = description
    }
    
    if (tags !== undefined && tags !== null) {
      docData.tags = tags
    }
    
    return DocumentEntity.createNew(docData).pipe(
      Effect.flatMap(document => this.documentRepository.save(document))
    )
  }

  getDocument(
    documentId: DocumentId,
    userId: UserId,
    roles: readonly Role[],
    userPolicies: readonly AccessPolicyEntity[]
  ): Effect.Effect<
    DocumentEntity,
    DocumentNotFoundError | DocumentServiceError | ValidationError
  > {
    return this.documentRepository.findById(documentId).pipe(
      Effect.flatMap(documentOption => {
        if (documentOption._tag === "None") {
          return Effect.fail(
            new DocumentServiceError("Document not found", "NOT_FOUND")
          )
        }

        const document = documentOption.value
        const canRead = this.checkDocumentAccess(
          documentId,
          document.ownerId,
          userId,
          roles,
          "read",
          userPolicies
        )

        if (!canRead) {
          return Effect.fail(
            new DocumentServiceError("Insufficient permissions to access document", "ACCESS_DENIED")
          )
        }

        return Effect.succeed(document)
      })
    )
  }

  updateDocument(
    documentId: DocumentId,
    userId: UserId,
    roles: readonly Role[],
    userPolicies: readonly AccessPolicyEntity[],
    updates: {
      title?: string
      description?: string | null
      tags?: string[]
    }
  ): Effect.Effect<
    DocumentEntity,
    DocumentNotFoundError | DocumentServiceError | DocumentValidationError | ValidationError | BusinessRuleViolationError
  > {
    return this.documentRepository.findById(documentId).pipe(
      Effect.flatMap(documentOption => {
        if (documentOption._tag === "None") {
          return Effect.fail(
            new DocumentServiceError("Document not found", "NOT_FOUND")
          )
        }

        const document = documentOption.value
        const canWrite = this.checkDocumentAccess(
          documentId,
          document.ownerId,
          userId,
          roles,
          "write",
          userPolicies
        )

        if (!canWrite) {
          return Effect.fail(
            new DocumentServiceError("Insufficient permissions to update document", "ACCESS_DENIED")
          )
        }

        return Effect.succeed(document)
      }),
      Effect.flatMap(document => 
        Effect.gen(this, function* () {
          let updatedDocument = document

          if (updates.title) {
            updatedDocument = yield* updatedDocument.rename(updates.title)
          }

          if (updates.description !== undefined) {
            updatedDocument = yield* updatedDocument.updateDescription(updates.description)
          }

          if (updates.tags) {
            updatedDocument = yield* updatedDocument.addTags(updates.tags)
          }

          return yield* this.documentRepository.save(updatedDocument)
        })
      )
    )
  }

  deleteDocument(
    documentId: DocumentId,
    userId: UserId,
    roles: readonly Role[],
    userPolicies: readonly AccessPolicyEntity[]
  ): Effect.Effect<
    boolean,
    DocumentNotFoundError | DocumentServiceError | ValidationError
  > {
    return Effect.gen(this, function* () {
      const documentOption = yield* this.documentRepository.findById(documentId)
      
      if (documentOption._tag === "None") {
        return yield* Effect.fail(
          new DocumentServiceError("Document not found", "NOT_FOUND")
        )
      }

      const document = documentOption.value
      const canDelete = this.checkDocumentAccess(
        documentId,
        document.ownerId,
        userId,
        roles,
        "admin",
        userPolicies
      )

      if (!canDelete) {
        return yield* Effect.fail(
          new DocumentServiceError("Insufficient permissions to delete document", "ACCESS_DENIED")
        )
      }

      return yield* this.documentRepository.delete(documentId)
    })
  }

  private checkDocumentAccess(
    documentId: DocumentId,
    documentOwnerId: UserId,
    userId: UserId,
    roles: readonly Role[],
    requiredLevel: "read" | "write" | "admin",
    userPolicies: readonly AccessPolicyEntity[]
  ): boolean {
    const context: DocumentAccessContext = {
      userId,
      roles,
      documentId,
      documentOwnerId,
      userPolicies,
    }

    const accessResult = DocumentAccessPolicy.canAccess(context, requiredLevel)
    return accessResult.granted
  }
}
