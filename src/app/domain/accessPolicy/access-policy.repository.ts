import { Effect, Option } from "effect"
import { AccessPolicyEntity, Role, SubjectType } from "./access-policy.entity"
import {
  AccessPolicyConflictError,
  AccessPolicyNotFoundError,
  AccessPolicyValidationError,
} from "@domain/accessPolicy/access-policy.error"
import { ValidationError } from "@domain/utils/base.errors"
import { BaseRepository, type RepositoryEffect } from "@domain/utils/base.repository"
import { DocumentId, UserId } from "@domain/refined/ids"

/**
 * Access policy repository interface with Effect-based signatures and typed errors.
 */
export abstract class AccessPolicyRepository extends BaseRepository<AccessPolicyEntity> {

  protected readonly entityName = "AccessPolicy"

  // Standardized CRUD per BaseRepository
  abstract insert(policy: AccessPolicyEntity): RepositoryEffect<AccessPolicyEntity, AccessPolicyValidationError | AccessPolicyConflictError>
  abstract update(policy: AccessPolicyEntity): RepositoryEffect<AccessPolicyEntity, AccessPolicyValidationError | AccessPolicyConflictError>
  abstract fetchById(id: string): RepositoryEffect<Option.Option<AccessPolicyEntity>, AccessPolicyNotFoundError>
  abstract list(): RepositoryEffect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError>

  abstract findById(
    id: string
  ): Effect.Effect<Option.Option<AccessPolicyEntity>, AccessPolicyNotFoundError | ValidationError>

  abstract findByResourceId(
    resourceId: DocumentId
  ): Effect.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | ValidationError>

  abstract findBySubject(
    subjectType: SubjectType,
    subjectId?: UserId,
    role?: Role
  ): Effect.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | ValidationError>

  abstract findByUserAndResource(
    userId: UserId,
    resourceId: DocumentId
  ): Effect.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | ValidationError>

  // Standardized exists/delete per BaseRepository
  abstract exists(id: string): RepositoryEffect<boolean, AccessPolicyNotFoundError>

  abstract save(
    policy: AccessPolicyEntity
  ): Effect.Effect<AccessPolicyEntity, AccessPolicyConflictError | AccessPolicyValidationError | ValidationError>

  abstract delete(id: string): RepositoryEffect<boolean, AccessPolicyNotFoundError>

  abstract deleteByResourceId(
    resourceId: DocumentId
  ): Effect.Effect<number, AccessPolicyNotFoundError>

  abstract deleteByUserId(
    userId: UserId
  ): Effect.Effect<number, AccessPolicyNotFoundError>
}
