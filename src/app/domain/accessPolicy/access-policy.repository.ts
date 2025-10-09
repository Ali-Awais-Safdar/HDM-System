import { Effect, Option } from "effect"
import { AccessPolicyEntity, Role, SubjectType } from "./access-policy.entity"
import {
  AccessPolicyConflictError,
  AccessPolicyNotFoundError,
  AccessPolicyValidationError,
} from "@domain/accessPolicy/access-policy.error"
import { BaseRepository, type RepositoryEffect } from "@domain/utils/base.repository"
import { AccessPolicyId, DocumentId, UserId } from "@domain/refined/ids"

/**
 * Access policy repository interface with Effect-based signatures and typed errors.
 */
export abstract class AccessPolicyRepository extends BaseRepository<AccessPolicyEntity> {

  protected readonly entityName = "AccessPolicy"

  // Standardized CRUD per BaseRepository
  abstract insert(policy: AccessPolicyEntity): RepositoryEffect<AccessPolicyEntity, AccessPolicyValidationError | AccessPolicyConflictError>
  abstract update(policy: AccessPolicyEntity): RepositoryEffect<AccessPolicyEntity, AccessPolicyValidationError | AccessPolicyConflictError>
  abstract fetchById(id: AccessPolicyId): RepositoryEffect<Option.Option<AccessPolicyEntity>, AccessPolicyNotFoundError>
  abstract list(): RepositoryEffect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError>

  abstract findById(
    id: AccessPolicyId
  ): Effect.Effect<Option.Option<AccessPolicyEntity>, AccessPolicyNotFoundError | AccessPolicyValidationError>

  abstract findByResourceId(
    resourceId: DocumentId
  ): Effect.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | AccessPolicyValidationError>

  abstract findBySubject(
    subjectType: SubjectType,
    subjectId?: UserId,
    role?: Role
  ): Effect.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | AccessPolicyValidationError>

  abstract findByUserAndResource(
    userId: UserId,
    resourceId: DocumentId
  ): Effect.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | AccessPolicyValidationError>

  // Standardized exists/delete per BaseRepository
  abstract exists(id: AccessPolicyId): RepositoryEffect<boolean, AccessPolicyNotFoundError>

  abstract save(
    policy: AccessPolicyEntity
  ): Effect.Effect<AccessPolicyEntity, AccessPolicyConflictError | AccessPolicyValidationError>

  abstract delete(id: AccessPolicyId): RepositoryEffect<boolean, AccessPolicyNotFoundError>

  abstract deleteByResourceId(
    resourceId: DocumentId
  ): Effect.Effect<number, AccessPolicyNotFoundError>

  abstract deleteByUserId(
    userId: UserId
  ): Effect.Effect<number, AccessPolicyNotFoundError>
}
