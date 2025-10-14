import { Schema as S } from "effect"

/**
 * HashedPassword refined type for stored password hashes
 * 
 * This type represents a password that has been hashed by a password hasher service.
 * It has different validation rules than the raw Password type:
 * - Length: 1-255 characters (to accommodate various hash algorithms)
 * - No complexity requirements (hash is already processed)
 * - Used for storage and verification, not user input
 * 
 * Runtime guarantees:
 * - Always a non-empty string
 * - Length within database constraints (255 chars max)
 * - Valid hash format from password hasher service
 */
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
