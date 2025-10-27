import { seedUser } from "../../infra/setup/seed-helpers"
import type { DatabaseInterface } from "@infra/db/interfaces"
import type { UserEntity } from "@domain/user/user.entity"
import type { EmailAddress } from "@domain/refined/email"
import type { UserId, WorkspaceId } from "@domain/refined/ids"

// Deterministic IDs for test actors
export const TEST_OWNER_ID = "11111111-1111-1111-1111-111111111111" as UserId
export const TEST_ADMIN_ID = "22222222-2222-2222-2222-222222222222" as UserId
export const TEST_COLLABORATOR_ID = "33333333-3333-3333-3333-333333333333" as UserId

// Deterministic workspace ID for testing
export const TEST_WORKSPACE_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa" as WorkspaceId
export const TEST_WORKSPACE_ID_2 = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" as WorkspaceId

/**
 * Actor type for role-based access testing
 */
export type TestActor = "owner" | "admin" | "collaborator"

/**
 * Seed test actors (owner, admin, collaborator) with deterministic IDs
 */
export async function seedTestActors(
  db: DatabaseInterface
): Promise<{
  owner: UserEntity
  admin: UserEntity
  collaborator: UserEntity
}> {
  const { faker } = await import("@faker-js/faker")
  // Use Faker with a seed to get deterministic IDs
  faker.seed(100)
  
  const owner = await seedUser(db, {
    email: "owner@test.com" as EmailAddress,
    roles: ["USER"]
  })

  const admin = await seedUser(db, {
    email: "admin@test.com" as EmailAddress,
    roles: ["ADMIN", "USER"]
  })

  const collaborator = await seedUser(db, {
    email: "collaborator@test.com" as EmailAddress,
    roles: ["USER"]
  })

  return { owner, admin, collaborator }
}

/**
 * Get actor ID by role from seeded actors
 */
export function getActorId(
  actors: { owner: UserEntity; admin: UserEntity; collaborator: UserEntity },
  actor: TestActor
): UserId {
  switch (actor) {
    case "owner":
      return actors.owner.id
    case "admin":
      return actors.admin.id
    case "collaborator":
      return actors.collaborator.id
  }
}

/**
 * Get actor entity by role (must be called after seedTestActors)
 */
export function getActorEntity(
  actors: { owner: UserEntity; admin: UserEntity; collaborator: UserEntity },
  actor: TestActor
): UserEntity {
  switch (actor) {
    case "owner":
      return actors.owner
    case "admin":
      return actors.admin
    case "collaborator":
      return actors.collaborator
  }
}

