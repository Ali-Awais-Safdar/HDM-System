import { Schema as S } from "effect"

/**
 * HashedPassword value object representing a securely hashed password.
 * This is a domain concept that represents the result of password hashing.
 */
export const HashedPassword = S.String.pipe(
  S.filter((s) => s.length > 0, { message: () => "Hashed password cannot be empty" }),
  S.filter((s) => s.length <= 255, { message: () => "Hashed password cannot exceed 255 characters" }),
  S.brand("HashedPassword")
)

export type HashedPassword = S.Schema.Type<typeof HashedPassword>

export const makeHashedPassword = (input: unknown) => S.decodeUnknown(HashedPassword)(input)
