import { Schema as S } from "effect"
import { faker } from "../factories/common"
import { AccessPolicySchema, type PermissionAction, type Role } from "@domain/accessPolicy/access-policy.schema"
import { AccessPolicyEntity } from "@domain/accessPolicy/access-policy.entity"
import { expectSuccess } from "../../utils/test.helpers"
import { AccessPolicyId, DocumentId, UserId } from "@domain/refined/ids"

type EncodedAccessPolicy = S.Schema.Encoded<typeof AccessPolicySchema>

const FIXED_CREATED_AT = new Date("2025-01-03T00:00:00.000Z")

const actionSupersets: ReadonlyArray<readonly PermissionAction[]> = [
  ["read"],
  ["read", "download"],
  ["read", "update"],
  ["read", "update", "delete"],
  ["read", "update", "share"],
]

const deterministicDefaults = (): EncodedAccessPolicy => ({
  id: faker.string.uuid() as AccessPolicyId,
  resourceType: "document",
  resourceId: faker.string.uuid() as DocumentId,
  subjectType: "user",
  subjectId: faker.string.uuid() as UserId,
  role: undefined,
  actions: faker.helpers.arrayElement(actionSupersets).slice(),
  effect: "allow",
  createdAt: FIXED_CREATED_AT.toISOString(),
  updatedAt: undefined,
} as EncodedAccessPolicy)

export const generateAccessPolicy = (
  overrides: Partial<EncodedAccessPolicy> = {}
): EncodedAccessPolicy => {
  const base = deterministicDefaults()
  return { ...base, ...overrides } as EncodedAccessPolicy
}

export const createUserPolicy = (
  resourceId: string,
  userId: string,
  actions?: readonly PermissionAction[],
  overrides: Partial<EncodedAccessPolicy> = {}
) => {
  const base: Partial<EncodedAccessPolicy> = {
    resourceId,
    subjectType: "user",
    subjectId: userId,
    role: undefined,
    ...overrides,
  }
  if (actions && actions.length > 0) {
    ;(base as any).actions = [...actions] as PermissionAction[]
  }
  return generateAccessPolicy(base)
}

export const createRolePolicy = (
  resourceId: string,
  role: Role,
  actions?: readonly PermissionAction[],
  overrides: Partial<EncodedAccessPolicy> = {}
) => {
  const base: Partial<EncodedAccessPolicy> = {
    resourceId,
    subjectType: "role",
    subjectId: undefined,
    role,
    ...overrides,
  }
  if (actions && actions.length > 0) {
    ;(base as any).actions = [...actions] as PermissionAction[]
  }
  return generateAccessPolicy(base)
}

export const createAccessPolicyEntity = (
  overrides: Partial<EncodedAccessPolicy> = {}
) => expectSuccess(AccessPolicyEntity.create(generateAccessPolicy(overrides)))


