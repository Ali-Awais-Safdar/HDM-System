import { Effect, Option } from "effect"
import type {
  AccessPolicy,
  PermissionAction
} from "@domain/accessPolicy/access-policy.schema"
import { AccessPolicyValidationError } from "@domain/accessPolicy/access-policy.error"
import { BusinessRuleViolationError } from "@domain/utils/base.errors"

export class AccessPolicyGuards {
  static readonly isAccessPolicy = (u: unknown): u is AccessPolicy =>
    !!u && typeof u === "object" && "resourceType" in (u as any)

  /**
   * Validates cross-field invariants for an access policy.
   */
  static validateDomainRules(
    policy: AccessPolicy
  ): Effect.Effect<AccessPolicy, AccessPolicyValidationError, never> {
    if (!policy.actions || policy.actions.length === 0) {
      return Effect.fail(
        new AccessPolicyValidationError(
          "Policy must grant at least one action",
          "actions",
          policy.actions
        )
      )
    }

    if (Option.isNone(policy.subjectId) && policy.subjectType === "user") {
      return Effect.fail(
        new AccessPolicyValidationError(
          "User-based policy requires subjectId",
          "subjectId",
          undefined
        )
      )
    }

    if (Option.isNone(policy.role) && policy.subjectType === "role") {
      return Effect.fail(
        new AccessPolicyValidationError(
          "Role-based policy requires role",
          "role",
          undefined
        )
      )
    }

    return Effect.succeed(policy)
  }

  /**
   * Prepares the action list after additions, ensuring uniqueness.
   */
  static prepareActionsForAddition(
    currentActions: readonly PermissionAction[],
    newActions: readonly PermissionAction[]
  ): Effect.Effect<readonly PermissionAction[], never, never> {
    const merged = Array.from(
      new Set<PermissionAction>([...currentActions, ...newActions])
    )
    return Effect.succeed(merged)
  }

  /**
   * Ensures action removal maintains a valid policy.
   */
  static prepareActionsForRemoval(
    currentActions: readonly PermissionAction[],
    actionsToRemove: readonly PermissionAction[]
  ): Effect.Effect<readonly PermissionAction[], BusinessRuleViolationError, never> {
    const remaining = currentActions.filter(
      (action) => !actionsToRemove.includes(action)
    )

    if (remaining.length === 0) {
      return Effect.fail(
        new BusinessRuleViolationError(
          "INVALID_POLICY_STATE",
          "Policy must grant at least one action",
          { actionsToRemove }
        )
      )
    }

    return Effect.succeed(remaining)
  }
}

export const isAccessPolicy = AccessPolicyGuards.isAccessPolicy
