import { Effect as E, Clock } from "effect"
import { UserEntity, type SerializedUser } from "@domain/user/user.entity"
import { UserValidationError } from "@domain/user/user.error"
import type { UserModel, NewUserModel } from "@infra/db/models/user.model"

export const toDb = (
  user: UserEntity
): E.Effect<NewUserModel, UserValidationError, never> => {
  return E.gen(function* () {
    const serialized = yield* user.serialized()
    
    const dbRow: NewUserModel = {
      id: serialized.id,
      email: serialized.email,
      passwordHash: serialized.passwordHash,
      roles: serialized.roles as string[],
      workspaceId: (serialized.workspaceId ?? null) as string | null,
      createdAt: new Date(serialized.createdAt),
      updatedAt: serialized.updatedAt ? new Date(serialized.updatedAt) : null
    }
    
    return dbRow
  }).pipe(
    E.mapError((error) => 
      new UserValidationError(
        `Failed to serialize user for persistence: ${error.message}`,
        "user",
        user.id
      )
    )
  )
}

export const fromDb = (
  row: UserModel
): E.Effect<UserEntity, UserValidationError, Clock.Clock> => {
  const serialized: SerializedUser = {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    roles: row.roles as string[],
    workspaceId: row.workspaceId ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt 
      ? (row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt)
      : null
  }
  
  return UserEntity.create(serialized)
}

