import { Schema as S } from "effect"
import { Optional } from "@domain/utils/schema.utils"
import { UserId } from "@domain/refined/ids"

export const VersionAuthor = Optional(UserId)
export type VersionAuthor = S.Schema.Type<typeof VersionAuthor>