import { Effect as E, Clock } from "effect"
import { AccessPolicyEntity, type SerializedAccessPolicy } from "@domain/accessPolicy/access-policy.entity"
import { AccessPolicyValidationError } from "@domain/accessPolicy/access-policy.error"
import type { AccessPolicyModel, NewAccessPolicyModel } from "@infra/db/models/access-policy.model"

export const toDb = (
  policy: AccessPolicyEntity
): E.Effect<NewAccessPolicyModel, AccessPolicyValidationError, never> => {
  return E.gen(function* () {
    const serialized = yield* policy.serialized()
    
    const dbRow: NewAccessPolicyModel = {
      id: serialized.id,
      resourceType: serialized.resourceType,
      resourceId: serialized.resourceId,
      subjectType: serialized.subjectType,
      subjectId: serialized.subjectId ?? null,
      role: serialized.role ?? null,
      actions: serialized.actions as string[],
      effect: serialized.effect,
      createdAt: new Date(serialized.createdAt),
      updatedAt: serialized.updatedAt ? new Date(serialized.updatedAt) : null
    }
    
    return dbRow
  }).pipe(
    E.mapError((error) => 
      new AccessPolicyValidationError(
        `Failed to serialize access policy for persistence: ${error.message}`,
        "accessPolicy",
        policy.id
      )
    )
  )
}

export const fromDb = (
  row: AccessPolicyModel
): E.Effect<AccessPolicyEntity, AccessPolicyValidationError, Clock.Clock> => {
  // Schema validation in Entity.create() will catch any invalid values
  const serialized: SerializedAccessPolicy = {
    id: row.id,
    resourceType: row.resourceType as "document",
    resourceId: row.resourceId,
    subjectType: row.subjectType as "user" | "role",
    subjectId: row.subjectId ?? null,
    role: (row.role ?? null) as "ADMIN" | "USER" | null,
    actions: row.actions as ("read" | "update" | "delete" | "download" | "share")[],
    effect: row.effect as "allow",
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt 
      ? (row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt)
      : null
  }
  
  return AccessPolicyEntity.create(serialized)
}

