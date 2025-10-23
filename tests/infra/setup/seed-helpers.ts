import { expectSuccess } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"
import type { DatabaseInterface } from "@infra/db/interfaces"

// Import entities
import { UserEntity, type SerializedUser } from "@domain/user/user.entity"
import { DocumentEntity, type SerializedDocument } from "@domain/document/document.entity"
import { DocumentVersionEntity, type SerializedDocumentVersion } from "@domain/documentVersion/document-version.entity"
import { DownloadTokenEntity, type SerializedDownloadToken } from "@domain/downloadToken/download-token.entity"
import { AccessPolicyEntity, type SerializedAccessPolicy } from "@domain/accessPolicy/access-policy.entity"

// Import mappers
import * as UserMapper from "@infra/db/mappers/user.mapper"
import * as DocumentMapper from "@infra/db/mappers/document.mapper"
import * as DocumentVersionMapper from "@infra/db/mappers/document-version.mapper"
import * as DownloadTokenMapper from "@infra/db/mappers/download-token.mapper"
import * as AccessPolicyMapper from "@infra/db/mappers/access-policy.mapper"

// Import database models
import { users } from "@infra/db/models/user.model"
import { documents } from "@infra/db/models/document.model"
import { documentVersions } from "@infra/db/models/document-version.model"
import { downloadTokens } from "@infra/db/models/download-token.model"
import { accessPolicies } from "@infra/db/models/access-policy.model"

// Import factories
import { generateUser } from "../../domain/factories/user.factory"
import { generateDocument } from "../../domain/factories/document.factory"
import { generateDocumentVersion } from "../../domain/factories/document-version.factory"
import { generateDownloadToken } from "../../domain/factories/download-token.factory"
import { generateAccessPolicy } from "../../domain/factories/access-policy.factory"

export const SEED_TIMESTAMP = new Date("2025-01-03T00:00:00.000Z")
export const SEED_TIMESTAMP_MS = SEED_TIMESTAMP.getTime()

/**
 * Seed a user into the database.
 * 
 * Process:
 * 1. Call UserEntity.create with factory data (schema logic runs)
 * 2. Convert to DB row with UserMapper.toDb
 * 3. Insert via Drizzle
 * 
 * @param db - Database interface
 * @param overrides - Optional field overrides for the user
 * @returns The created UserEntity
 */
export async function seedUser(
  db: DatabaseInterface,
  overrides: Partial<SerializedUser> = {}
): Promise<UserEntity> {
  const userData = generateUser(overrides)
  
  // Create entity with domain constructor (schema logic runs)
  const entity = expectSuccess(
    withTestClock(UserEntity.create(userData), SEED_TIMESTAMP_MS)
  )
  
  // Convert to DB row with mapper
  const dbRow = expectSuccess(UserMapper.toDb(entity))
  
  // Insert via Drizzle
  await db.insert(users).values(dbRow)
  
  return entity
}

/**
 * Seed a document into the database.
 * 
 * @param db - Database interface
 * @param overrides - Optional field overrides for the document
 * @returns The created DocumentEntity
 */
export async function seedDocument(
  db: DatabaseInterface,
  overrides: Partial<SerializedDocument> = {}
): Promise<DocumentEntity> {
  const documentData = generateDocument(overrides)
  
  const entity = expectSuccess(
    withTestClock(DocumentEntity.create(documentData), SEED_TIMESTAMP_MS)
  )
  
  const dbRow = expectSuccess(DocumentMapper.toDb(entity))
  
  await db.insert(documents).values(dbRow)
  
  return entity
}

/**
 * Seed a document version into the database.
 * 
 * Note: documentId must reference an existing document due to FK constraint.
 * Use this function only when you have a valid document already seeded.
 * 
 * @param db - Database interface
 * @param overrides - Optional field overrides for the document version
 * @returns The created DocumentVersionEntity
 */
export async function seedDocumentVersion(
  db: DatabaseInterface,
  overrides: Partial<SerializedDocumentVersion> & { documentId: string }
): Promise<DocumentVersionEntity> {
  const versionData = generateDocumentVersion(overrides)
  
  const entity = expectSuccess(
    withTestClock(DocumentVersionEntity.create(versionData), SEED_TIMESTAMP_MS)
  )
  
  const dbRow = expectSuccess(DocumentVersionMapper.toDb(entity))
  
  await db.insert(documentVersions).values(dbRow)
  
  return entity
}

/**
 * Seed a download token into the database.
 * 
 * Note: Uses a future timestamp for expiry to avoid validation errors
 * 
 * @param db - Database interface
 * @param overrides - Optional field overrides for the download token
 * @returns The created DownloadTokenEntity
 */
export async function seedDownloadToken(
  db: DatabaseInterface,
  overrides: Partial<SerializedDownloadToken> = {}
): Promise<DownloadTokenEntity> {
  // Use current time instead of SEED_TIMESTAMP to ensure expiry is in the future
  const now = new Date()
  const tokenData = generateDownloadToken(overrides, now)
  
  const entity = expectSuccess(
    withTestClock(DownloadTokenEntity.create(tokenData), now.getTime())
  )
  
  const dbRow = expectSuccess(DownloadTokenMapper.toDb(entity))
  
  await db.insert(downloadTokens).values(dbRow)
  
  return entity
}

/**
 * Seed an access policy into the database.
 * 
 * @param db - Database interface
 * @param overrides - Optional field overrides for the access policy
 * @returns The created AccessPolicyEntity
 */
export async function seedAccessPolicy(
  db: DatabaseInterface,
  overrides: Partial<SerializedAccessPolicy> = {}
): Promise<AccessPolicyEntity> {
  const policyData = generateAccessPolicy(overrides)
  
  const entity = expectSuccess(
    withTestClock(AccessPolicyEntity.create(policyData), SEED_TIMESTAMP_MS)
  )
  
  const dbRow = expectSuccess(AccessPolicyMapper.toDb(entity))
  
  await db.insert(accessPolicies).values(dbRow)
  
  return entity
}

/**
 * Seed a complete document with its owner and initial version.
 * This is a convenience function for common test scenarios.
 * 
 * Strategy:
 * 1. Create owner
 * 2. Create document (no circular FK dependency anymore)
 * 3. Create initial version for the document
 * 
 * @param db - Database interface
 * @returns Object containing the owner, document, and initial version
 */
export async function seedDocumentWithOwnerAndVersion(
  db: DatabaseInterface
): Promise<{
  owner: UserEntity
  document: DocumentEntity
  version: DocumentVersionEntity
}> {
  const { faker } = await import("@faker-js/faker")
  
  // Seed the owner first
  const owner = await seedUser(db)
  
  // Generate document ID upfront
  const documentId = faker.string.uuid() as any
  
  // Create document (no currentVersionId needed!)
  const documentData = generateDocument({
    id: documentId,
    ownerId: owner.id,
  })
  
  const documentEntity = expectSuccess(
    withTestClock(DocumentEntity.create(documentData), SEED_TIMESTAMP_MS)
  )
  
  // Convert to DB row and insert
  const documentRow = expectSuccess(DocumentMapper.toDb(documentEntity))
  await db.insert(documents).values(documentRow)
  
  // Now create the initial version for this document
  const version = await seedDocumentVersion(db, {
    documentId: documentId,
    version: 1,
  })
  
  return { owner, document: documentEntity, version }
}

