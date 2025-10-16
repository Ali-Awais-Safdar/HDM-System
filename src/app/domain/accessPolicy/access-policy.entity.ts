import { Effect, Option, ParseResult, Schema as S, Clock } from "effect"
import { AccessPolicyValidationError } from "@domain/accessPolicy/access-policy.error"
import {
  AccessPolicySchema,
  PermissionAction,
  PermissionLevel,
  Role,
  SubjectType
} from "@domain/accessPolicy/access-policy.schema"
import { AccessPolicyGuards } from "@domain/accessPolicy/access-policy.guards"
import { PermissionSet, computePermissionLevelSync } from "@domain/accessPolicy/permission-set.vo"
import { BusinessRuleViolationError } from "@domain/utils/base.errors"
import { formatParseError, mapParseError } from "@domain/utils/option.utils"
import { AccessPolicyId, DocumentId, UserId } from "@domain/refined/ids"
import { getCurrentTime } from "@domain/utils/audit-trail"
import { applyMutationWithTimestamp, serializeWith } from "@domain/utils/schema-transform"

export type { PermissionLevel, PermissionAction, Role, SubjectType }

export type AccessPolicyType = S.Schema.Type<typeof AccessPolicySchema>
export type SerializedAccessPolicy = S.Schema.Encoded<typeof AccessPolicySchema>

export class AccessPolicyEntity {
  readonly id!: AccessPolicyId
  readonly resourceType!: "document"
  readonly resourceId!: DocumentId
  readonly subjectType!: SubjectType
  readonly subjectId!: Option.Option<UserId>
  readonly role!: Option.Option<Role>
  readonly actions!: readonly PermissionAction[]
  readonly effect!: "allow"
  readonly createdAt!: Date
  readonly updatedAt!: Option.Option<Date>

  static create(
    input: SerializedAccessPolicy
  ): Effect.Effect<
    AccessPolicyEntity,
    AccessPolicyValidationError,
    Clock.Clock
  > {
    return getCurrentTime().pipe(
      Effect.flatMap((now) => {
        const dataWithAudit = {
          ...input,
          createdAt: input.createdAt || now,
          updatedAt: input.updatedAt
        }
        return S.decodeUnknown(AccessPolicySchema)(dataWithAudit).pipe(
          Effect.flatMap((data) =>
            AccessPolicyGuards.validateDomainRules(data).pipe(
              Effect.map(() => new AccessPolicyEntity(data))
            )
          ),
          Effect.mapError((error) =>
            new AccessPolicyValidationError(
              mapParseError(error as ParseResult.ParseError, (m) => `AccessPolicy validation failed: ${m}`),
              "accessPolicy",
              input
            )
          )
        )
      })
    )
  }

  private constructor(data: AccessPolicyType) {
    this.id = data.id
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
    this.resourceType = data.resourceType
    this.resourceId = data.resourceId
    this.subjectType = data.subjectType
    this.subjectId = data.subjectId
    this.role = data.role
    this.actions = data.actions
    this.effect = data.effect
  }

  /**
   * Serializes the entity to its external representation.
   * This avoids full re-encoding during mutations by reusing existing validation.
   */
  serialized(): Effect.Effect<SerializedAccessPolicy, ParseResult.ParseError, never> {
    return serializeWith(AccessPolicySchema, this as unknown as AccessPolicyType)
  }

  get isUserSpecificPolicy(): boolean {
    return this.subjectType === "user"
  }

  get isRoleBasedPolicy(): boolean {
    return this.subjectType === "role"
  }

  get actionCount(): number {
    return this.actions.length
  }

  get permissionLevel(): PermissionLevel {
    return computePermissionLevelSync({ actions: this.actions } as PermissionSet)
  }

  appliesToSubject(
    subjectType: SubjectType,
    subjectId?: UserId,
    role?: Role
  ): boolean {
    if (this.subjectType !== subjectType) return false

    if (subjectType === "user") {
      return Option.match(this.subjectId, {
        onNone: () => false,
        onSome: (id: UserId) => id === subjectId
      })
    }

    if (subjectType === "role") {
      return Option.match(this.role, {
        onNone: () => false,
        onSome: (r: Role) => r === role
      })
    }

    return false
  }

  appliesToResource(resourceType: string, resourceId: DocumentId): boolean {
    return this.resourceType === resourceType && this.resourceId === resourceId
  }

  addActions(
    newActions: PermissionAction[]
  ): Effect.Effect<
    AccessPolicyEntity,
    AccessPolicyValidationError | BusinessRuleViolationError,
    Clock.Clock
  > {
    if (newActions.length === 0) {
      return Effect.succeed(this)
    }

    return AccessPolicyGuards.prepareActionsForAddition(
      this.actions,
      newActions
    ).pipe(
      Effect.flatMap((allActions) =>
        applyMutationWithTimestamp(
          AccessPolicySchema,
          this as unknown,
          (_now) => ({ actions: allActions } as any),
          (error) => new AccessPolicyValidationError(
            `Failed to prepare access policy for action addition: ${formatParseError(error as ParseResult.ParseError)}`,
            "actions",
            allActions
          ),
          (input) => AccessPolicyEntity.create(input)
        )
      ),
      Effect.mapError((error) => {
        const err = error as unknown
        if (err instanceof AccessPolicyValidationError) return err
        if (err instanceof BusinessRuleViolationError) return err
        return new AccessPolicyValidationError(String(err), "actions", newActions)
      })
    )
  }

  removeActions(
    actionsToRemove: PermissionAction[]
  ): Effect.Effect<
    AccessPolicyEntity,
    AccessPolicyValidationError | BusinessRuleViolationError,
    Clock.Clock
  > {
    if (actionsToRemove.length === 0) {
      return Effect.succeed(this)
    }

    return AccessPolicyGuards.prepareActionsForRemoval(
      this.actions,
      actionsToRemove
    ).pipe(
      Effect.flatMap((remainingActions) =>
        applyMutationWithTimestamp(
          AccessPolicySchema,
          this as unknown,
          (_now) => ({ actions: remainingActions } as any),
          (error) => new AccessPolicyValidationError(
            `Failed to prepare access policy for action removal: ${formatParseError(error as ParseResult.ParseError)}`,
            "actions",
            remainingActions
          ),
          (input) => AccessPolicyEntity.create(input)
        )
      ),
      Effect.mapError((error) => {
        const err = error as unknown
        if (err instanceof AccessPolicyValidationError) return err
        if (err instanceof BusinessRuleViolationError) return err
        return new AccessPolicyValidationError(String(err), "actions", actionsToRemove)
      })
    )
  }
}
