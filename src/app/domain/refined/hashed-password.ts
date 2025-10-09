import { Schema as S } from "effect"

export const HashedPassword = S.String.pipe(
  S.filter((value) => value.length > 0, {
    message: () => "Hashed password cannot be empty"
  }),
  S.filter((value) => value.length <= 255, {
    message: () => "Hashed password cannot exceed 255 characters"
  }),
  S.brand("HashedPassword")
)

export type HashedPassword = S.Schema.Type<typeof HashedPassword>

export const makeHashedPassword = (input: unknown) =>
  S.decodeUnknown(HashedPassword)(input)
