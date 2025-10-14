import { Effect, Option } from "effect"
import type {
  AccessPolicy,
  PermissionAction
} from "@domain/accessPolicy/access-policy.schema"
import { AccessPolicyValidationError } from "@domain/accessPolicy/access-policy.error"
import { BusinessRuleViolationError } from "@domain/utils/base.errors"
import { require } from "@domain/utils/effect-guards"

export class AccessPolicyGuards {

  static validateDomainRules(
    policy: AccessPolicy
  ): Effect.Effect<AccessPolicy, AccessPolicyValidationError, never> {
    return require(
      policy.actions && policy.actions.length > 0,
      () => new AccessPolicyValidationError(
        "Policy must grant at least one action",
        "actions",
        policy.actions
      )
    ).pipe(
      Effect.flatMap(() => require(
        !(Option.isNone(policy.subjectId) && policy.subjectType === "user"),
        () => new AccessPolicyValidationError(
          "User-based policy requires subjectId",
          "subjectId",
          undefined
        )
      )),
      Effect.flatMap(() => require(
        !(Option.isNone(policy.role) && policy.subjectType === "role"),
        () => new AccessPolicyValidationError(
          "Role-based policy requires role",
          "role",
          undefined
        )
      )),
      Effect.map(() => policy)
    )
  }

  static prepareActionsForAddition(
    currentActions: readonly PermissionAction[],
    newActions: readonly PermissionAction[]
  ): Effect.Effect<readonly PermissionAction[], never, never> {
    const merged = Array.from(
      new Set<PermissionAction>([...currentActions, ...newActions])
    )
    return Effect.succeed(merged)
  }

  static prepareActionsForRemoval(
    currentActions: readonly PermissionAction[],
    actionsToRemove: readonly PermissionAction[]
  ): Effect.Effect<readonly PermissionAction[], BusinessRuleViolationError, never> {
    const remaining = currentActions.filter(
      (action) => !actionsToRemove.includes(action)
    )

    return require(
      remaining.length > 0,
      () => new BusinessRuleViolationError(
        "INVALID_POLICY_STATE",
        "Policy must grant at least one action",
        { actionsToRemove }
      )
    ).pipe(
      Effect.map(() => remaining)
    )
  }
}
