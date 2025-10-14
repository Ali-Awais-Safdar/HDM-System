import { Schema as S } from "effect"
import { RoleSchema } from "@domain/accessPolicy/access-policy.schema"
import { UserGuards } from "@domain/user/user.guards"
import { Optional } from "@domain/utils/schema.utils"
import { BaseEntitySchema } from "@domain/utils/schema.base"
import { EmailAddress } from "@domain/refined/email"
import { HashedPassword } from "@domain/refined/hashed-password"
import { UserId, WorkspaceId } from "@domain/refined/ids"

export const UserSchema = S.extend(
  BaseEntitySchema(UserId),
  S.Struct({
    email: EmailAddress,
    passwordHash: HashedPassword,
    roles: S.Array(RoleSchema).pipe(UserGuards.ValidRoles),
    workspaceId: Optional(WorkspaceId)
  })
)
export type User = S.Schema.Type<typeof UserSchema>
