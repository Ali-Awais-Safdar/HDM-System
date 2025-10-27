import { seedDocumentWithOwnerAndVersion } from "../../infra/setup/seed-helpers"
import { generateAccessPolicy } from "../../domain/factories/access-policy.factory"
import { expectSuccess } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import { AccessPolicyEntity } from "@domain/accessPolicy/access-policy.entity"
import { AccessPolicyMapper } from "@infra/db/mappers"
import { accessPolicies } from "@infra/db/models/access-policy.model"
import { SEED_TIMESTAMP_MS } from "../../infra/setup/seed-helpers"
import type { DatabaseInterface } from "@infra/db/interfaces"
import type { DocumentEntity, SerializedDocument } from "@domain/document/document.entity"
import type { UserEntity } from "@domain/user/user.entity"
import type { DocumentVersionEntity } from "@domain/documentVersion/document-version.entity"
import type { AccessPolicyEntity as AccessPolicyEntityType } from "@domain/accessPolicy/access-policy.entity"
import type { PermissionAction } from "@domain/accessPolicy/access-policy.schema"
import type { UserId, DocumentId } from "@domain/refined/ids"

export interface PolicyConfig {
  read?: boolean
  write?: boolean
  admin?: boolean
}

/**
 * Map policy level to actions
 */
function mapLevelToActions(level: "read" | "write" | "admin"): PermissionAction[] {
  switch (level) {
    case "read":
      return ["read"]
    case "write":
      return ["read", "update"]
    case "admin":
      return ["read", "update", "delete", "share"]
  }
}

/**
 * Seed a document with owner/version and access policies for actors
 */
export async function seedDocumentWithPolicies(
  db: DatabaseInterface,
  overrides: Partial<SerializedDocument> & {
    owner: UserEntity
    policyConfigs?: Record<UserId | string, PolicyConfig>
  }
): Promise<{
  owner: UserEntity
  document: DocumentEntity
  version: DocumentVersionEntity
  policies: AccessPolicyEntityType[]
}> {
  // First seed the document with owner and version
  const { document, version } = await seedDocumentWithOwnerAndVersion(db)

  // Seed access policies based on configuration
  const policies: AccessPolicyEntityType[] = []
  const configs = overrides.policyConfigs || {}

  for (const [userId, config] of Object.entries(configs)) {
    if (!config) continue

    // Map config to actions
    const actionSet = new Set<PermissionAction>()
    if (config.read) mapLevelToActions("read").forEach(a => actionSet.add(a))
    if (config.write) mapLevelToActions("write").forEach(a => actionSet.add(a))
    if (config.admin) mapLevelToActions("admin").forEach(a => actionSet.add(a))

    if (actionSet.size === 0) continue

    const actions = Array.from(actionSet)

    const policyData = generateAccessPolicy({
      resourceId: document.id as DocumentId,
      subjectId: userId as UserId,
      subjectType: "user",
      actions
    })

    const policy = expectSuccess(
      withTestClock(AccessPolicyEntity.create(policyData), SEED_TIMESTAMP_MS)
    )

    const dbRow = expectSuccess(AccessPolicyMapper.toDb(policy))
    await db.insert(accessPolicies).values(dbRow)

    policies.push(policy)
  }

  return { owner: overrides.owner, document, version, policies }
}

/**
 * Convenience function to seed a document with read-only collaborator access
 */
export async function seedDocumentWithReadAccess(
  db: DatabaseInterface,
  owner: UserEntity,
  collaborator: UserEntity
): Promise<{
  owner: UserEntity
  document: DocumentEntity
  version: DocumentVersionEntity
  policies: AccessPolicyEntityType[]
}> {
  return await seedDocumentWithPolicies(db, {
    owner,
    ownerId: owner.id,
    policyConfigs: {
      [collaborator.id]: { read: true }
    }
  })
}

/**
 * Convenience function to seed a document with read-write collaborator access
 */
export async function seedDocumentWithReadWriteAccess(
  db: DatabaseInterface,
  owner: UserEntity,
  collaborator: UserEntity
): Promise<{
  owner: UserEntity
  document: DocumentEntity
  version: DocumentVersionEntity
  policies: AccessPolicyEntityType[]
}> {
  return await seedDocumentWithPolicies(db, {
    owner,
    ownerId: owner.id,
    policyConfigs: {
      [collaborator.id]: { read: true, write: true }
    }
  })
}

/**
 * Convenience function to seed a document with full collaborator access
 */
export async function seedDocumentWithFullAccess(
  db: DatabaseInterface,
  owner: UserEntity,
  collaborator: UserEntity
): Promise<{
  owner: UserEntity
  document: DocumentEntity
  version: DocumentVersionEntity
  policies: AccessPolicyEntityType[]
}> {
  return await seedDocumentWithPolicies(db, {
    owner,
    ownerId: owner.id,
    policyConfigs: {
      [collaborator.id]: { read: true, write: true, admin: true }
    }
  })
}

