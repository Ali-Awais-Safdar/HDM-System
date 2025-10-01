import { Effect, Schema as S, ParseResult } from "effect"
import { AccessPolicySchema, PermissionAction, Role, SubjectType, PermissionLevel } from "../schema/access-policy.schema"
import { ValidationError, BusinessRuleViolationError } from "../errors/domain.errors"
import { AccessPolicyValidationError } from "../errors/access-policy.errors"
import { createEntityFactory, type Entity, type IEntity } from "../utils/entity.utils"

export type { PermissionLevel, PermissionAction, Role, SubjectType }

export interface IAccessPolicy extends IEntity {
  readonly id: string
  readonly resourceType: "document"
  readonly resourceId: string
  readonly subjectType: SubjectType
  readonly subjectId: string | undefined
  readonly role: Role | undefined
  readonly actions: readonly PermissionAction[]
  readonly effect: "allow"
  readonly createdAt: Date
}

/**
 * Serialized AccessPolicy type derived from schema encoding.
 */
export type SerializedAccessPolicy = S.Schema.Encoded<typeof AccessPolicySchema>
export class AccessPolicyEntity implements Entity<S.Schema.Type<typeof AccessPolicySchema>, SerializedAccessPolicy>, IAccessPolicy {
  // ========== Static Factory Methods ==========

  static create = createEntityFactory(
    AccessPolicySchema,
    (props) => new AccessPolicyEntity(props),
    "AccessPolicy"
  ).create

  static createNew = (props: {
    resourceType: "document";
    resourceId: string;
    subjectType: SubjectType;
    subjectId?: string;
    role?: Role;
    actions: PermissionAction[];
  }): Effect.Effect<AccessPolicyEntity, ValidationError | AccessPolicyValidationError> => {
    if (props.subjectType === "user" && !props.subjectId) {
      return Effect.fail(new AccessPolicyValidationError(
        "User-based policy requires subjectId",
        "subjectId",
        undefined
      ))
    }
    
    if (props.subjectType === "role" && !props.role) {
      return Effect.fail(new AccessPolicyValidationError(
        "Role-based policy requires role",
        "role",
        undefined
      ))
    }

    if (!props.actions || props.actions.length === 0) {
      return Effect.fail(new AccessPolicyValidationError(
        "Policy must grant at least one action",
        "actions",
        props.actions
      ))
    }

    const policyData = {
      id: crypto.randomUUID(),
      resourceType: props.resourceType,
      resourceId: props.resourceId,
      subjectType: props.subjectType,
      subjectId: props.subjectId,
      role: props.role,
      actions: props.actions,
      effect: "allow" as const,
      createdAt: new Date()
    }

    return S.decodeUnknown(AccessPolicySchema)(policyData).pipe(
      Effect.map((validated) => new AccessPolicyEntity(validated)),
      Effect.mapError((error) => new ValidationError(
        `Invalid access policy data: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        policyData
      ))
    )
  }

  static fromPermissionLevel = (props: {
    resourceId: string;
    subjectId: string;
    level: PermissionLevel;
  }): Effect.Effect<AccessPolicyEntity, ValidationError | AccessPolicyValidationError> => {
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

  static fromPersistence = createEntityFactory(
    AccessPolicySchema,
    (props) => new AccessPolicyEntity(props),
    "AccessPolicy"
  ).fromPersistence

  static unsafe = createEntityFactory(
    AccessPolicySchema,
    (props) => new AccessPolicyEntity(props),
    "AccessPolicy"
  ).unsafe

  // ========== Constructor ==========

  private constructor(readonly props: Readonly<S.Schema.Type<typeof AccessPolicySchema>>) {}

  // ========== Getters & Computed Properties ==========
  
  get id() { return this.props.id }
  get resourceType() { return this.props.resourceType }
  get resourceId() { return this.props.resourceId }
  get subjectType() { return this.props.subjectType }
  get subjectId() { return this.props.subjectId }
  get role() { return this.props.role }
  get actions() { return this.props.actions }
  get effect() { return this.props.effect }
  get createdAt() { return this.props.createdAt }

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
  
  appliesToSubject(subjectType: SubjectType, subjectId?: string, role?: Role): boolean {
    if (this.subjectType !== subjectType) return false
    
    if (subjectType === "user") {
      return this.subjectId === subjectId
    }
    
    if (subjectType === "role") {
      return this.role === role
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
    return actions.every(action => this.grantsAction(action))
  }

  grantsAnyAction(actions: PermissionAction[]): boolean {
    return actions.some(action => this.grantsAction(action))
  }

  isUserPolicy(): boolean {
    return this.isUserSpecificPolicy
  }

  isRolePolicy(): boolean {
    return this.isRoleBasedPolicy
  }

  getPriorityLevel(): number {
    return this.priorityLevel
  }

  addActions = (newActions: PermissionAction[]): Effect.Effect<AccessPolicyEntity, ValidationError | BusinessRuleViolationError> => {
    if (newActions.length === 0) {
      return Effect.succeed(this)
    }

    const allActions = Array.from(new Set([...this.actions, ...newActions]))

    // Validate that all actions are valid PermissionAction values
    // Since allActions comes from combining existing (valid) actions with new (typed) actions,
    // and the array is deduplicated, it should be valid
    
    // Construct new entity directly
    const updated = new AccessPolicyEntity({
      ...this.props,
      actions: allActions
    })

    return Effect.succeed(updated)
  }

  removeActions = (actionsToRemove: PermissionAction[]): Effect.Effect<AccessPolicyEntity, ValidationError | BusinessRuleViolationError> => {
    if (actionsToRemove.length === 0) {
      return Effect.succeed(this)
    }

    const remainingActions = this.actions.filter(action => !actionsToRemove.includes(action))

    if (remainingActions.length === 0) {
      return Effect.fail(new BusinessRuleViolationError(
        "INVALID_POLICY_STATE",
        "Policy must grant at least one action",
        { actionsToRemove }
      ))
    }

    // Construct new entity directly with remaining actions
    const updated = new AccessPolicyEntity({
      ...this.props,
      actions: remainingActions
    })

    return Effect.succeed(updated)
  }

  // ========== Serialization Methods ==========
  
  toWireFormat = (): S.Schema.Type<typeof AccessPolicySchema> => {
    return this.props
  }

  /**
   * Serializes the entity using Effect Schema encoding.
   * Properly transforms optional fields to external format for APIs and persistence.
   */
  serialized = (): Effect.Effect<SerializedAccessPolicy, ParseResult.ParseError, never> => {
    return S.encode(AccessPolicySchema)(this.props)
  }

  toPlainObject = () => {
    return {
      id: this.id,
      resourceType: this.resourceType,
      resourceId: this.resourceId,
      subjectType: this.subjectType,
      subjectId: this.subjectId,
      role: this.role,
      actions: this.actions,
      effect: this.effect,
      isUserSpecificPolicy: this.isUserSpecificPolicy,
      isRoleBasedPolicy: this.isRoleBasedPolicy,
      actionCount: this.actionCount,
      priorityLevel: this.priorityLevel,
      permissionLevel: this.permissionLevel
    }
  }
}

