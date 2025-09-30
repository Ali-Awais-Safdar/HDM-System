import { Schema as S } from "effect"
import { UserId } from "./id.vo"

/**
 * User role schema using Effect Schema.
 */
export const UserRole = S.Literal("admin", "user")
export type UserRole = S.Schema.Type<typeof UserRole>

/**
 * JWT payload schema using Effect Schema for consistent validation.
 */
export const JwtPayload = S.Struct({
  sub: S.String.pipe(S.filter((s) => s.length > 0, { message: () => "JWT payload must contain subject (sub)" })),
  email: S.String.pipe(S.filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), { message: () => "JWT payload must contain valid email" })),
  role: UserRole,
  iat: S.Number.pipe(S.filter((n) => n > 0, { message: () => "JWT payload must contain valid issued at time" })),
  exp: S.Number.pipe(S.filter((n) => n > 0, { message: () => "JWT payload must contain valid expiration time" }))
}).pipe(
  S.filter(
    (data) => data.exp > data.iat,
    { message: () => "JWT payload must contain valid expiration time" }
  )
)
export type JwtPayload = S.Schema.Type<typeof JwtPayload>

// Factory function for creating JwtPayload from unknown input
export const makeJwtPayload = (input: unknown) => S.decodeUnknownSync(JwtPayload)(input)

/**
 * JWT value object with validation rules.
 * Ensures JWT payload requirements are enforced at the domain level using Effect Schema.
 */
export class Jwt {
  private constructor(
    private readonly _payload: JwtPayload,
    private readonly _token: string
  ) {}

  static create(payload: JwtPayload, token: string): Jwt {
    const validatedPayload = S.decodeUnknownSync(JwtPayload)(payload);
    return new Jwt(validatedPayload, token);
  }

  get payload(): JwtPayload {
    return this._payload;
  }

  get token(): string {
    return this._token;
  }

  get userId(): UserId {
    return this._payload.sub as UserId;
  }

  get email(): string {
    return this._payload.email;
  }

  get role(): UserRole {
    return this._payload.role;
  }

  isExpired(currentTime: number = Date.now()): boolean {
    return this._payload.exp * 1000 < currentTime;
  }

  expiresIn(currentTime: number = Date.now()): number {
    return Math.max(0, this._payload.exp * 1000 - currentTime);
  }
}
