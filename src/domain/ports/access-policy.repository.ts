import { Effect, Option } from "effect"
import { AccessPolicyEntity, SubjectType, Role } from "../entities/access-policy.entity"
import { DocumentId, UserId } from "../value-objects/id.vo"
import { 
  AccessPolicyNotFoundError,
  AccessPolicyValidationError,
  AccessPolicyConflictError
} from "../errors/access-policy.errors"
import { ValidationError } from "../errors/domain.errors"

/**
 * Access policy repository interface with Effect-based signatures and typed errors.
 */
export abstract class AccessPolicyRepository {

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

  abstract exists(
    id: string
  ): Effect.Effect<boolean, AccessPolicyNotFoundError>

  abstract save(
    policy: AccessPolicyEntity
  ): Effect.Effect<AccessPolicyEntity, AccessPolicyConflictError | AccessPolicyValidationError | ValidationError>

  abstract delete(
    id: string
  ): Effect.Effect<boolean, AccessPolicyNotFoundError>

  abstract deleteByResourceId(
    resourceId: DocumentId
  ): Effect.Effect<number, AccessPolicyNotFoundError>

  abstract deleteByUserId(
    userId: UserId
  ): Effect.Effect<number, AccessPolicyNotFoundError>
}

