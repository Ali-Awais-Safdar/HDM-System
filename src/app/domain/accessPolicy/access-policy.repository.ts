import { Effect } from "effect"
import { AccessPolicyEntity, Role, SubjectType } from "./access-policy.entity"
import {
  AccessPolicyConflictError,
  AccessPolicyNotFoundError,
  AccessPolicyValidationError,
} from "@domain/accessPolicy/access-policy.error"
import { BaseRepository } from "@domain/utils/base.repository"
import { DocumentId, UserId } from "@domain/refined/ids"
import { DatabaseError } from "@domain/utils/base.errors"

/**
 * Access policy repository interface with Effect-based signatures and typed errors.
 */
export abstract class AccessPolicyRepository extends BaseRepository<AccessPolicyEntity, AccessPolicyNotFoundError, AccessPolicyValidationError | AccessPolicyConflictError> {

  protected readonly entityName = "AccessPolicy"

  // Domain-specific read operations

  abstract findByResourceId(
    resourceId: DocumentId
  ): Effect.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | AccessPolicyValidationError | DatabaseError>

  abstract findBySubject(
    subjectType: SubjectType,
    subjectId?: UserId,
    role?: Role
  ): Effect.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | AccessPolicyValidationError | DatabaseError>

  abstract findByUserAndResource(
    userId: UserId,
    resourceId: DocumentId
  ): Effect.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | AccessPolicyValidationError | DatabaseError>

  abstract deleteByResourceId(
    resourceId: DocumentId
  ): Effect.Effect<number, AccessPolicyNotFoundError | DatabaseError>

  abstract deleteByUserId(
    userId: UserId
  ): Effect.Effect<number, AccessPolicyNotFoundError | DatabaseError>
}
