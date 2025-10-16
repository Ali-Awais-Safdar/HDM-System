import { Effect, Schema as S } from "effect"
import { DocumentEntity } from "@domain/document/document.entity"
import { UserEntity } from "@domain/user/user.entity"
import { AccessPolicyEntity } from "@domain/accessPolicy/access-policy.entity"
import { PermissionLevel, Role, AccessPolicySchema } from "@domain/accessPolicy/access-policy.schema"
import { DocumentAccessPolicy, DocumentAccessResult } from "@domain/accessPolicy/document-access.policy"
import { createDocumentAccessContext } from "@domain/accessPolicy/document-access.context"
import { mapParseError } from "@domain/utils/option.utils"
import { UserGuards } from "@domain/user/user.guards"
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
  static canAccessDocument(
    user: UserEntity,
    document: DocumentEntity,
    userPolicies: ReadonlyArray<AccessPolicyEntity>,
    requiredLevel: PermissionLevel
  ): Effect.Effect<
    DocumentAccessResult,
    DocumentAccessContextInvalidError | DocumentAccessDeniedError | DocumentAccessInsufficientPermissionsError
  > {
    // Encode AccessPolicyEntity instances to schema-encoded form, then project to PolicyView
    return Effect.forEach(userPolicies, (p) =>
      S.encode(AccessPolicySchema)(p as unknown as any)
    ).pipe(
      Effect.mapError((e) => new DocumentAccessContextInvalidError(
        `Invalid policy: ${mapParseError(e, (m) => m)}`
      )),
      Effect.flatMap((encodedPolicies) => {
        const context = {
          userId: user.id,
          roles: user.roles,
          documentId: document.id,
          documentOwnerId: document.ownerId,
          userPolicies: encodedPolicies.map((ep: any) => ({
            subjectType: ep.subjectType,
            subjectId: ep.subjectId,
            role: ep.role,
            actions: ep.actions
          }))
        }
        // Validate context at boundary using schema (policies now encoded/minimized)
        return createDocumentAccessContext(context).pipe(
          Effect.mapError((error) => new DocumentAccessContextInvalidError(
            `Invalid access context: ${mapParseError(error, (m) => m)}`,
            "accessContext",
            context
          )),
          Effect.flatMap((validatedContext) => {
            // Normalize the context to unwrap Option values for the policy
            const normalizedContext = {
              userId: validatedContext.userId,
              roles: validatedContext.roles,
              documentId: validatedContext.documentId,
              documentOwnerId: validatedContext.documentOwnerId,
              userPolicies: validatedContext.userPolicies.map((policy: any) => ({
                subjectType: policy.subjectType,
                subjectId: policy.subjectId._tag === "Some" ? policy.subjectId.value : undefined,
                role: policy.role._tag === "Some" ? policy.role.value : undefined,
                actions: policy.actions
              }))
            }
            return DocumentAccessPolicy.canAccessE(normalizedContext, requiredLevel).pipe(
              Effect.flatMap((result): Effect.Effect<
                DocumentAccessResult,
                DocumentAccessDeniedError | DocumentAccessInsufficientPermissionsError
              > => {
                if (result.granted) return Effect.succeed(result)
                // Use the normalized context to compute effective level
                return DocumentAccessPolicy.getEffectivePermissionLevel(normalizedContext).pipe(
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
    return UserGuards.isAdmin(user as any)
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
