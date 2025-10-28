import { Schema as S } from "effect"
import { AccessPolicyId } from "@domain/refined/ids"
import { AccessPolicyFields } from "@domain/accessPolicy/access-policy.schema"
import { DateTimeFromString } from "@domain/refined/date-time"

export const AccessPolicyResponseSchema = S.Struct({
  id: AccessPolicyId,
  resourceType: AccessPolicyFields.resourceType,
  resourceId: AccessPolicyFields.resourceId,
  subjectType: AccessPolicyFields.subjectType,
  subjectId: AccessPolicyFields.subjectId,
  role: AccessPolicyFields.role,
  actions: AccessPolicyFields.actions,
  effect: AccessPolicyFields.effect,
  createdAt: DateTimeFromString, // ISO date string
  updatedAt: S.optional(DateTimeFromString) // ISO date string or undefined
})
export type AccessPolicyResponseEncoded = S.Schema.Encoded<typeof AccessPolicyResponseSchema>

