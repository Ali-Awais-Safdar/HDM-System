import { Effect, Schema as S, Option, ParseResult } from "effect"
import { AccessPolicyValidationError } from "@domain/accessPolicy/access-policy.error"
import {
  AccessPolicySchema,
  PermissionAction,
  PermissionLevel,
  Role,
  SubjectType,
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

/**
 * Runtime type derived from schema.
 * Represents the validated AccessPolicy type with Option<T> for optional fields.
 */
export type AccessPolicyType = S.Schema.Type<typeof AccessPolicySchema>

/**
 * Serialized AccessPolicy type derived from schema encoding.
 * Represents the external format for APIs and persistence.
 */
export type SerializedAccessPolicy = S.Schema.Encoded<typeof AccessPolicySchema>

/**
 * Access Policy Entity
 * 
 * Represents an access control policy for resources (documents).
 * Follows immutable entity pattern - all updates return new instances.
 */
export class AccessPolicyEntity
  extends BaseEntity<IAccessPolicy, typeof AccessPolicySchema>
  implements IAccessPolicy
{
  // ========== Direct Readonly Properties ==========
  // Properties cannot be reassigned after construction
  // Optional values are explicitly handled with Option
  
  readonly resourceType: "document"
  readonly resourceId: string
  readonly subjectType: SubjectType
  readonly subjectId: Option.Option<string> // Explicit optionality with Option type
  readonly role: Option.Option<Role> // Explicit optionality with Option type
  readonly actions: readonly PermissionAction[]
  readonly effect: "allow"

  // ========== Static Factory Methods ==========

  private static toRuntime(data: AccessPolicyType): IAccessPolicy {
    return {
      id: data.id,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      subjectType: data.subjectType,
      subjectId: data.subjectId,
      role: data.role,
      actions: data.actions,
      effect: data.effect,
      createdAt: data.createdAt,
      updatedAt: null
    }
  }

  /**
   * Creates an AccessPolicy entity from external/unknown data.
   * Validates input using schema and returns Effect with proper error handling.
   * This is the primary factory method for creating policies from external sources.
   */
  static create(input: unknown): Effect.Effect<AccessPolicyEntity, ValidationError, never> {
    return S.decodeUnknown(AccessPolicySchema)(input).pipe(
      Effect.flatMap((validated) =>
        AccessPolicyGuards.validateDomainRules(validated)
      ),
      Effect.map((validated) =>
        new AccessPolicyEntity(AccessPolicyEntity.toRuntime(validated))
      ),
      Effect.mapError((error) => {
        if (error instanceof AccessPolicyValidationError) {
          return new ValidationError(error.message, error.field, input)
        }
        return new ValidationError(
          `Invalid access policy data: ${formatParseError(error)}`,
          undefined,
          input
        )
      })
    ) as Effect.Effect<AccessPolicyEntity, ValidationError, never>
  }

  /**
   * Creates a new AccessPolicy entity with business logic validation.
   * Use this for creating new policies in the domain (not from persistence).
   */
  static createNew(props: {
    resourceType: "document";
    resourceId: string;
    subjectType: SubjectType;
    subjectId?: string;
    role?: Role;
    actions: PermissionAction[];
  }): Effect.Effect<AccessPolicyEntity, ValidationError | AccessPolicyValidationError, never> {
    const policyData = {
      id: crypto.randomUUID(),
      resourceType: props.resourceType,
      resourceId: props.resourceId,
      subjectType: props.subjectType,
      subjectId: props.subjectId ?? null,
      role: props.role ?? null,
      actions: props.actions,
      effect: "allow" as const,
      createdAt: new Date()
    }

    return S.decodeUnknown(AccessPolicySchema)(policyData).pipe(
      Effect.flatMap((validated) =>
        AccessPolicyGuards.validateDomainRules(validated)
      ),
      Effect.map((validated) =>
        new AccessPolicyEntity(AccessPolicyEntity.toRuntime(validated))
      ),
      Effect.mapError((error) => {
        if (error instanceof AccessPolicyValidationError) {
          return error
        }
        return new ValidationError(
          `Invalid access policy data: ${formatParseError(error)}`,
          undefined,
          policyData
        )
      })
    ) as Effect.Effect<AccessPolicyEntity, ValidationError | AccessPolicyValidationError, never>
  }

  /**
   * Creates a policy from a permission level (convenience method).
   */
  static fromPermissionLevel(props: {
    resourceId: string;
    subjectId: string;
    level: PermissionLevel;
  }): Effect.Effect<AccessPolicyEntity, ValidationError | AccessPolicyValidationError, never> {
    const actionsMap: Record<PermissionLevel, PermissionAction[]> = {
      read: ["read" as PermissionAction],
      write: ["read" as PermissionAction, "update" as PermissionAction, "download" as PermissionAction],
      admin: ["read" as PermissionAction, "update" as PermissionAction, "delete" as PermissionAction, "download" as PermissionAction, "share" as PermissionAction]
    }

    return AccessPolicyEntity.createNew({
      resourceType: "document",
      resourceId: props.resourceId,
      subjectType: "user",
      subjectId: props.subjectId,
      actions: actionsMap[props.level]
    })
  }

  /**
   * Creates entity from persistence layer data.
   * Alias for create() for semantic clarity.
   */
  static fromPersistence(input: unknown): Effect.Effect<AccessPolicyEntity, ValidationError, never> {
    return AccessPolicyEntity.create(input)
  }

  /**
   * Unsafe constructor for when data is already validated.
   * Use only in controlled contexts (e.g., tests, after validation).
   */
  static unsafe(data: AccessPolicyType): AccessPolicyEntity {
    return new AccessPolicyEntity(AccessPolicyEntity.toRuntime(data))
  }

  // ========== Constructor (Private) ==========
  // Constructor receives pre-validated data
  // All validation happens in factory methods before construction
  
  private constructor(runtime: Readonly<IAccessPolicy>) {
    super(AccessPolicySchema, runtime)
    this.resourceType = runtime.resourceType
    this.resourceId = runtime.resourceId
    this.subjectType = runtime.subjectType
    this.subjectId = runtime.subjectId // Already Option<string> from schema
    this.role = runtime.role // Already Option<Role> from schema
    this.actions = runtime.actions
    this.effect = runtime.effect
  }

  // ========== Getters & Computed Properties ==========
  
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
    const hasAdmin = this.actions.includes("delete" as PermissionAction) || this.actions.includes("share" as PermissionAction)
    const hasWrite = this.actions.includes("update" as PermissionAction) || this.actions.includes("download" as PermissionAction)
    const hasRead = this.actions.includes("read" as PermissionAction)

    if (hasAdmin) return "admin"
    if (hasWrite) return "write"
    if (hasRead) return "read"
    return "read"
  }

  // ========== Public Domain Methods ==========
  
  /**
   * Checks if policy applies to a specific subject.
   */
  appliesToSubject(subjectType: SubjectType, subjectId?: string, role?: Role): boolean {
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

  /**
   * Checks if policy applies to a specific resource.
   */
  appliesToResource(resourceType: string, resourceId: string): boolean {
    return this.resourceType === resourceType && this.resourceId === resourceId
  }

  /**
   * Checks if policy grants a specific action.
   */
  grantsAction(action: PermissionAction): boolean {
    return this.actions.includes(action)
  }

  /**
   * Checks if policy grants all specified actions.
   */
  grantsAllActions(actions: PermissionAction[]): boolean {
    return actions.every(action => this.grantsAction(action))
  }

  /**
   * Checks if policy grants any of the specified actions.
   */
  grantsAnyAction(actions: PermissionAction[]): boolean {
    return actions.some(action => this.grantsAction(action))
  }

  /**
   * Checks if this is a user-specific policy.
   */
  isUserPolicy(): boolean {
    return this.isUserSpecificPolicy
  }

  /**
   * Checks if this is a role-based policy.
   */
  isRolePolicy(): boolean {
    return this.isRoleBasedPolicy
  }

  /**
   * Gets the priority level of this policy.
   */
  getPriorityLevel(): number {
    return this.priorityLevel
  }

  /**
   * Adds actions to the policy.
   * Returns new entity instance with updated actions (immutable update pattern).
   */
  addActions(newActions: PermissionAction[]): Effect.Effect<AccessPolicyEntity, ValidationError | BusinessRuleViolationError, never> {
    if (newActions.length === 0) {
      return Effect.succeed(this)
    }

    return AccessPolicyGuards.prepareActionsForAddition(this.actions, newActions).pipe(
      Effect.flatMap((allActions) =>
        this.serialized().pipe(
          Effect.mapError((error) =>
            new ValidationError(
              `Failed to prepare access policy for action addition: ${formatParseError(error)}`,
              "actions",
              allActions
            )
          ),
          Effect.flatMap((currentSerialized) =>
            AccessPolicyEntity.create({
              ...currentSerialized,
              actions: allActions
            })
          )
        )
      )
    )
  }

  /**
   * Removes actions from the policy.
   * Returns new entity instance with updated actions (immutable update pattern).
   */
  removeActions(actionsToRemove: PermissionAction[]): Effect.Effect<AccessPolicyEntity, ValidationError | BusinessRuleViolationError, never> {
    if (actionsToRemove.length === 0) {
      return Effect.succeed(this)
    }

    return AccessPolicyGuards.prepareActionsForRemoval(this.actions, actionsToRemove).pipe(
      Effect.flatMap((remainingActions) =>
        this.serialized().pipe(
          Effect.mapError((error) =>
            new ValidationError(
              `Failed to prepare access policy for action removal: ${formatParseError(error)}`,
              "actions",
              remainingActions
            )
          ),
          Effect.flatMap((currentSerialized) =>
            AccessPolicyEntity.create({
              ...currentSerialized,
              actions: remainingActions
            })
          )
        )
      )
    )
  }

  // ========== Serialization Methods ==========
  
  /**
   * Returns wire format (validated runtime type).
   * Used for internal domain operations.
   */
  toWireFormat(): IAccessPolicy {
    return {
      id: this.id,
      resourceType: this.resourceType,
      resourceId: this.resourceId,
      subjectType: this.subjectType,
      subjectId: this.subjectId,
      role: this.role,
      actions: this.actions,
      effect: this.effect,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }

  /**
   * Serializes the entity using Effect Schema encoding.
   * Properly transforms Option<T> fields to nullable values for external systems.
   * This is automatic serialization with type safety.
   */
  serialized(): Effect.Effect<SerializedAccessPolicy, ParseResult.ParseError, never> {
    return S.encode(AccessPolicySchema)(this.props as any) as Effect.Effect<SerializedAccessPolicy, ParseResult.ParseError, never>
  }

  /**
   * Converts to plain object for APIs.
   * Includes computed properties for convenience.
   */
  toPlainObject() {
    return {
      id: this.id,
      resourceType: this.resourceType,
      resourceId: this.resourceId,
      subjectType: this.subjectType,
      subjectId: Option.getOrNull(this.subjectId),
      role: Option.getOrNull(this.role),
      actions: this.actions,
      effect: this.effect,
      createdAt: this.createdAt,
      isUserSpecificPolicy: this.isUserSpecificPolicy,
      isRoleBasedPolicy: this.isRoleBasedPolicy,
      actionCount: this.actionCount,
      priorityLevel: this.priorityLevel,
      permissionLevel: this.permissionLevel
    }
  }
}
