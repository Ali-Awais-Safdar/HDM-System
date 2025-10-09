import { Effect, Option, ParseResult, Schema as S } from "effect"
import { AccessPolicyValidationError } from "@domain/accessPolicy/access-policy.error"
import {
  AccessPolicySchema,
  PermissionAction,
  PermissionLevel,
  Role,
  SubjectType
} from "@domain/accessPolicy/access-policy.schema"
import { AccessPolicyGuards } from "@domain/accessPolicy/access-policy.guards"
import { BaseEntity, type IEntity } from "@domain/utils/base.entity"
import { BusinessRuleViolationError, ValidationError } from "@domain/utils/base.errors"
import { formatParseError } from "@domain/utils/option.utils"

export type { PermissionLevel, PermissionAction, Role, SubjectType }

export interface IAccessPolicy extends IEntity<string> {
  readonly id: string
  readonly resourceType: "document"
  readonly resourceId: string
  readonly subjectType: SubjectType
  readonly subjectId: Option.Option<string>
  readonly role: Option.Option<Role>
  readonly actions: readonly PermissionAction[]
  readonly effect: "allow"
}

export type AccessPolicyType = S.Schema.Type<typeof AccessPolicySchema>
export type SerializedAccessPolicy = S.Schema.Encoded<typeof AccessPolicySchema>

export class AccessPolicyEntity
  extends BaseEntity<typeof AccessPolicySchema, AccessPolicyType>
  implements IAccessPolicy
{
  private constructor(data: AccessPolicyType) {
    super(AccessPolicySchema, data)
  }

  static create(
    input: SerializedAccessPolicy
  ): Effect.Effect<
    AccessPolicyEntity,
    AccessPolicyValidationError | ValidationError,
    never
  > {
    return S.decodeUnknown(AccessPolicySchema)(input).pipe(
      Effect.flatMap((data) =>
        AccessPolicyGuards.validateDomainRules(data).pipe(
          Effect.map(() => new AccessPolicyEntity(data))
        )
      ),
      Effect.mapError((error) => AccessPolicyEntity.toValidationError(error, input))
    )
  }

  private static toValidationError(
    error: unknown,
    input: SerializedAccessPolicy
  ): AccessPolicyValidationError | ValidationError {
    if (error instanceof AccessPolicyValidationError) {
      return error
    }
    return new ValidationError(
      `Invalid access policy data: ${formatParseError(error as ParseResult.ParseError)}`,
      undefined,
      input
    )
  }

  serialized(): Effect.Effect<
    SerializedAccessPolicy,
    ParseResult.ParseError,
    never
  > {
    return super.serialized() as Effect.Effect<
      SerializedAccessPolicy,
      ParseResult.ParseError,
      never
    >
  }

  get id(): string {
    return this.data.id
  }

  get resourceType(): "document" {
    return this.data.resourceType
  }

  get resourceId(): string {
    return this.data.resourceId
  }

  get subjectType(): SubjectType {
    return this.data.subjectType
  }

  get subjectId(): Option.Option<string> {
    return this.data.subjectId
  }

  get role(): Option.Option<Role> {
    return this.data.role
  }

  get actions(): readonly PermissionAction[] {
    return this.data.actions
  }

  get effect(): "allow" {
    return this.data.effect
  }

  get createdAt(): Date {
    return this.data.createdAt
  }

  get updatedAt(): Date | null {
    return Option.getOrNull(this.data.updatedAt)
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

  get priorityLevel(): number {
    if (this.isUserSpecificPolicy) return 2
    if (this.isRoleBasedPolicy) return 1
    return 0
  }

  get permissionLevel(): PermissionLevel {
    const hasAdmin =
      this.actions.includes("delete" as PermissionAction) ||
      this.actions.includes("share" as PermissionAction)
    const hasWrite =
      this.actions.includes("update" as PermissionAction) ||
      this.actions.includes("download" as PermissionAction)
    const hasRead = this.actions.includes("read" as PermissionAction)

    if (hasAdmin) return "admin"
    if (hasWrite) return "write"
    if (hasRead) return "read"
    return "read"
  }

  appliesToSubject(
    subjectType: SubjectType,
    subjectId?: string,
    role?: Role
  ): boolean {
    if (this.subjectType !== subjectType) return false

    if (subjectType === "user") {
      return Option.match(this.subjectId, {
        onNone: () => false,
        onSome: (id: string) => id === subjectId
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

  appliesToResource(resourceType: string, resourceId: string): boolean {
    return this.resourceType === resourceType && this.resourceId === resourceId
  }

  grantsAction(action: PermissionAction): boolean {
    return this.actions.includes(action)
  }

  grantsAllActions(actions: PermissionAction[]): boolean {
    return actions.every((action) => this.grantsAction(action))
  }

  grantsAnyAction(actions: PermissionAction[]): boolean {
    return actions.some((action) => this.grantsAction(action))
  }

  addActions(
    newActions: PermissionAction[]
  ): Effect.Effect<
    AccessPolicyEntity,
    ValidationError | BusinessRuleViolationError,
    never
  > {
    if (newActions.length === 0) {
      return Effect.succeed(this)
    }

    return AccessPolicyGuards.prepareActionsForAddition(
      this.actions,
      newActions
    ).pipe(
      Effect.flatMap((allActions) =>
        this.serialized().pipe(
          Effect.mapError(
            (error) =>
              new ValidationError(
                `Failed to prepare access policy for action addition: ${formatParseError(error)}`,
                "actions",
                allActions
              )
          ),
          Effect.flatMap((currentSerialized) =>
            AccessPolicyEntity.create({
              ...currentSerialized,
              actions: allActions,
              updatedAt: new Date()
            })
          )
        )
      ),
      Effect.mapError((error) =>
        error instanceof ValidationError
          ? error
          : new ValidationError(error.message)
      )
    )
  }

  removeActions(
    actionsToRemove: PermissionAction[]
  ): Effect.Effect<
    AccessPolicyEntity,
    ValidationError | BusinessRuleViolationError,
    never
  > {
    if (actionsToRemove.length === 0) {
      return Effect.succeed(this)
    }

    return AccessPolicyGuards.prepareActionsForRemoval(
      this.actions,
      actionsToRemove
    ).pipe(
      Effect.flatMap((remainingActions) =>
        this.serialized().pipe(
          Effect.mapError(
            (error) =>
              new ValidationError(
                `Failed to prepare access policy for action removal: ${formatParseError(error)}`,
                "actions",
                remainingActions
              )
          ),
          Effect.flatMap((currentSerialized) =>
            AccessPolicyEntity.create({
              ...currentSerialized,
              actions: remainingActions,
              updatedAt: new Date()
            })
          )
        )
      ),
      Effect.mapError((error) =>
        error instanceof ValidationError
          ? error
          : new ValidationError(error.message)
      )
    )
  }
}
