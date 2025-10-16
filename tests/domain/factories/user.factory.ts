import { Schema as S } from "effect"
import { faker } from "../factories/common"
import { UserSchema } from "@domain/user/user.schema"
import { UserEntity } from "@domain/user/user.entity"
import { expectSuccess } from "../../utils/test.helpers"
import { UserId } from "@domain/refined/ids"
import { EmailAddress } from "@domain/refined/email"
import { HashedPassword } from "@domain/refined/hashed-password"

type EncodedUser = S.Schema.Encoded<typeof UserSchema>

const deterministicDefaults = (): EncodedUser => ({
  id: faker.string.uuid() as UserId,
  email: `user_${faker.string.alphanumeric(6)}@example.com` as EmailAddress,
  passwordHash: `$2b$10$${faker.string.alphanumeric(53)}` as HashedPassword, // bcrypt-like length
  roles: ["USER"],
  workspaceId: undefined,
  createdAt: new Date("2025-01-03T00:00:00.000Z").toISOString(),
  updatedAt: undefined,
} as EncodedUser)

export const generateUser = (
  overrides: Partial<EncodedUser> = {}
): EncodedUser => {
  const base = deterministicDefaults()
  return { ...base, ...overrides } as EncodedUser
}

export const createUserEntity = (
  overrides: Partial<EncodedUser> = {}
) => expectSuccess(UserEntity.create(generateUser(overrides)))

export const createAdminUserEntity = (
  overrides: Partial<EncodedUser> = {}
) => createUserEntity({ roles: ["ADMIN"], ...overrides })


