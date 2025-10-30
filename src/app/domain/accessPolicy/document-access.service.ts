import { Effect, Schema as S, ParseResult } from "effect"
import { DocumentEntity } from "@domain/document/document.entity"
import { UserEntity } from "@domain/user/user.entity"
import { AccessPolicyEntity } from "@domain/accessPolicy/access-policy.entity"
import { PermissionLevel, Role, AccessPolicySchema } from "@domain/accessPolicy/access-policy.schema"
import { DocumentAccessPolicy, DocumentAccessResult } from "@domain/accessPolicy/document-access.policy"
import type { DocumentAccessContext } from "@domain/accessPolicy/document-access.policy"
import type { SerializedAccessPolicy } from "@domain/accessPolicy/access-policy.entity"
import { mapParseError } from "@domain/utils/option.utils"
import { UserId } from "@domain/refined/ids"
import {
  DocumentAccessContextInvalidError,
  DocumentAccessDeniedError,
  DocumentAccessInsufficientPermissionsError
} from "@domain/accessPolicy/document-access.error"

/**
 * DocumentAccessService - Domain service for document access control

 * Key responsibilities:
 * - Validate access context at boundaries
 * - Compose User, Document, and AccessPolicy entities
 * - Return deterministic boolean/typed results
 * - Maintain schema-first boundaries
 */
export class DocumentAccessService {
  static buildContext(
    user: UserEntity,
    document: DocumentEntity,
    encodedPolicies: ReadonlyArray<SerializedAccessPolicy>
  ): DocumentAccessContext {
    return {
      userId: user.id,
      roles: user.roles,
      documentId: document.id,
      documentOwnerId: document.ownerId,
      userPolicies: encodedPolicies.map((policy) => {
        const subjectId = policy.subjectId == null ? undefined : S.decodeUnknownSync(UserId)(policy.subjectId)
        const role = policy.role ?? undefined
        return {
          subjectType: policy.subjectType,
          ...(subjectId !== undefined ? { subjectId } : {}),
          ...(role !== undefined ? { role } : {}),
          actions: policy.actions
        }
      })
    }
  }

  static canAccessDocument(
    user: UserEntity,
    document: DocumentEntity,
    userPolicies: ReadonlyArray<AccessPolicyEntity>,
    requiredLevel: PermissionLevel
  ): Effect.Effect<
    DocumentAccessResult,
    DocumentAccessContextInvalidError | DocumentAccessDeniedError | DocumentAccessInsufficientPermissionsError
  > {
    // Encode AccessPolicyEntity instances to schema-encoded form (entity-optimized when available)
    return Effect.forEach(
      userPolicies,
      (p): Effect.Effect<SerializedAccessPolicy, ParseResult.ParseError, never> => {
        if (typeof (p)?.serialized === "function") {
          return (p as AccessPolicyEntity).serialized()
        }
        return S.encode(AccessPolicySchema)(p as any) as Effect.Effect<SerializedAccessPolicy, ParseResult.ParseError, never>
      }
    ).pipe(
      Effect.mapError((e) => new DocumentAccessContextInvalidError(
        `Invalid policy: ${mapParseError(e, (m) => m)}`
      )),
      Effect.flatMap((encodedPolicies) => {
        const context = DocumentAccessService.buildContext(user, document, encodedPolicies)
        return DocumentAccessPolicy.canAccessE(context, requiredLevel).pipe(
              Effect.flatMap((result): Effect.Effect<
                DocumentAccessResult,
                DocumentAccessDeniedError | DocumentAccessInsufficientPermissionsError
              > => {
                if (result.granted) return Effect.succeed(result)
                // Compute effective level for detailed error
                return DocumentAccessPolicy.getEffectivePermissionLevel(context).pipe(
                  Effect.flatMap((level): Effect.Effect<never, DocumentAccessDeniedError | DocumentAccessInsufficientPermissionsError> =>
                    level === null
                      ? Effect.fail(new DocumentAccessDeniedError(
                          String(user.id),
                          String(document.id),
                          requiredLevel,
                          result.reason
                        ))
                      : Effect.fail(new DocumentAccessInsufficientPermissionsError(
                          String(user.id),
                          String(document.id),
                          level,
                          requiredLevel
                        ))
                  )
                )
              })
            )
      })
    )
  }

  static canReadDocument(
    user: UserEntity,
    document: DocumentEntity,
    userPolicies: ReadonlyArray<AccessPolicyEntity>
  ): Effect.Effect<DocumentAccessResult, DocumentAccessContextInvalidError | DocumentAccessDeniedError | DocumentAccessInsufficientPermissionsError> {
    return DocumentAccessService.canAccessDocument(user, document, userPolicies, "read")
  }


  static canWriteDocument(
    user: UserEntity,
    document: DocumentEntity,
    userPolicies: ReadonlyArray<AccessPolicyEntity>
  ): Effect.Effect<DocumentAccessResult, DocumentAccessContextInvalidError | DocumentAccessDeniedError | DocumentAccessInsufficientPermissionsError> {
    return DocumentAccessService.canAccessDocument(user, document, userPolicies, "write")
  }


  static canAdminDocument(
    user: UserEntity,
    document: DocumentEntity,
    userPolicies: ReadonlyArray<AccessPolicyEntity>
  ): Effect.Effect<DocumentAccessResult, DocumentAccessContextInvalidError | DocumentAccessDeniedError | DocumentAccessInsufficientPermissionsError> {
    return DocumentAccessService.canAccessDocument(user, document, userPolicies, "admin")
  }

  static isOwner(user: UserEntity, document: DocumentEntity): boolean {
    return user.id === document.ownerId
  }

  static isAdmin(user: UserEntity): boolean {
    return user.roles.includes("ADMIN" as Role)
  }

  static hasAccess(
    user: UserEntity,
    document: DocumentEntity,
    userPolicies: ReadonlyArray<AccessPolicyEntity>,
    requiredLevel: PermissionLevel
  ): Effect.Effect<boolean, never> {
    return DocumentAccessService.canAccessDocument(user, document, userPolicies, requiredLevel).pipe(
      Effect.map((result) => result.granted),
      Effect.catchAll(() => Effect.succeed(false))
    )
  }
}

export type { DocumentAccessResult, PermissionLevel, Role }
