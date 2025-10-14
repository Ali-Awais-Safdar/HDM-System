import { Effect, Option, Clock } from "effect"
import { randomUUID } from "crypto"
import { AccessPolicyEntity } from "@domain/accessPolicy/access-policy.entity"
import { ClockService } from "@application/services/clock.service"
import { DocumentAccessService } from "@domain/accessPolicy/document-access.service"
import { DocumentEntity, type SerializedDocument } from "@domain/document/document.entity"
import { DocumentRepository } from "@domain/document/document.repository"
import {
  DocumentNotFoundError,
  DocumentValidationError,
} from "@domain/document/document.error"
import { BusinessRuleViolationError, DomainError, ValidationError } from "@domain/utils/base.errors"
import { DocumentId, DocumentVersionId, UserId } from "@domain/refined/ids"
import { UserRepository } from "@domain/user/user.repository"
import { UserNotFoundError } from "@domain/user/user.error"

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
    private readonly documentRepository: DocumentRepository,
    private readonly userRepository: UserRepository
  ) {}

  createDocument(
    ownerId: UserId,
    title: string,
    currentVersionId: DocumentVersionId,
    description?: string | null,
    tags?: string[] | null
  ): Effect.Effect<
    DocumentEntity,
    DocumentValidationError | ValidationError,
    Clock.Clock
  > {
    const now = ClockService.now()
    const documentInput: SerializedDocument = {
      id: randomUUID(),
      ownerId,
      title,
      description: description ?? null,
      tags: tags ?? null,
      currentVersionId,
      createdAt: now,
      updatedAt: Option.none()
    }

    return DocumentEntity.create(documentInput).pipe(
      Effect.flatMap((document) => this.documentRepository.save(document))
    )
  }

  getDocument(
    documentId: DocumentId,
    userId: UserId,
    userPolicies: readonly AccessPolicyEntity[]
  ): Effect.Effect<
    DocumentEntity,
    DocumentNotFoundError | DocumentServiceError | ValidationError | UserNotFoundError
  > {
    return Effect.all([
      this.documentRepository.findById(documentId),
      this.userRepository.findById(userId)
    ]).pipe(
      Effect.flatMap(([documentOption, userOption]) => {
        if (documentOption._tag === "None") {
          return Effect.fail(new DocumentServiceError("Document not found", "NOT_FOUND"))
        }
        
        if (userOption._tag === "None") {
          return Effect.fail(new DocumentServiceError("User not found", "NOT_FOUND"))
        }

        return DocumentAccessService.canReadDocument(
          userOption.value,
          documentOption.value,
          userPolicies
        ).pipe(
          Effect.flatMap((accessResult) =>
            accessResult.granted
              ? Effect.succeed(documentOption.value)
              : Effect.fail(new DocumentServiceError(
                  `Insufficient permissions to access document: ${accessResult.reason}`,
                  "ACCESS_DENIED"
                ))
          )
        )
      }),
      Effect.catchAll((e) =>
        e instanceof ValidationError
          ? Effect.fail(new DocumentServiceError("Validation failed", "UNKNOWN_ERROR", { cause: (e as ValidationError).message }))
          : Effect.fail(e as DocumentServiceError | DocumentNotFoundError)
      )
    )
  }

  updateDocument(
    documentId: DocumentId,
    userId: UserId,
    userPolicies: readonly AccessPolicyEntity[],
    updates: {
      title?: string
      description?: string | null
      tags?: string[]
    }
  ): Effect.Effect<
    DocumentEntity,
    DocumentNotFoundError | DocumentServiceError | DocumentValidationError | ValidationError | BusinessRuleViolationError | UserNotFoundError,
    Clock.Clock
  > {
    return Effect.all([
      this.documentRepository.findById(documentId),
      this.userRepository.findById(userId)
    ]).pipe(
      Effect.flatMap(([documentOption, userOption]) => {
        if (documentOption._tag === "None") {
          return Effect.fail(new DocumentServiceError("Document not found", "NOT_FOUND"))
        }
        
        if (userOption._tag === "None") {
          return Effect.fail(new DocumentServiceError("User not found", "NOT_FOUND"))
        }

        return DocumentAccessService.canWriteDocument(
          userOption.value,
          documentOption.value,
          userPolicies
        ).pipe(
          Effect.flatMap((accessResult) =>
            accessResult.granted
              ? Effect.succeed(documentOption.value)
              : Effect.fail(new DocumentServiceError(
                  `Insufficient permissions to update document: ${accessResult.reason}`,
                  "ACCESS_DENIED"
                ))
          )
        )
      }),
      Effect.flatMap(document => 
        Effect.gen(this, function* () {
          let updatedDocument = document

          if (updates.title) {
            updatedDocument = yield* updatedDocument.rename(updates.title)
          }

          if (updates.description !== undefined) {
            const descOpt = updates.description === null
              ? Option.none<string>()
              : Option.some(updates.description)
            updatedDocument = yield* updatedDocument.updateDescription(descOpt)
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
    userPolicies: readonly AccessPolicyEntity[]
  ): Effect.Effect<
    boolean,
    DocumentNotFoundError | DocumentServiceError | ValidationError | UserNotFoundError
  > {
    return Effect.all([
      this.documentRepository.findById(documentId),
      this.userRepository.findById(userId)
    ]).pipe(
      Effect.flatMap(([documentOption, userOption]) => {
        if (documentOption._tag === "None") {
          return Effect.fail(new DocumentServiceError("Document not found", "NOT_FOUND"))
        }
        
        if (userOption._tag === "None") {
          return Effect.fail(new DocumentServiceError("User not found", "NOT_FOUND"))
        }

        return DocumentAccessService.canAdminDocument(
          userOption.value,
          documentOption.value,
          userPolicies
        ).pipe(
          Effect.flatMap((accessResult) =>
            accessResult.granted
              ? this.documentRepository.delete(documentId) as Effect.Effect<boolean, DocumentServiceError | ValidationError | DocumentNotFoundError, never>
              : Effect.fail(new DocumentServiceError(
                  `Insufficient permissions to delete document: ${accessResult.reason}`,
                  "ACCESS_DENIED"
                ))
          )
        )
      }),
      Effect.orElse(() => Effect.succeed(false))
    )
  }

}
