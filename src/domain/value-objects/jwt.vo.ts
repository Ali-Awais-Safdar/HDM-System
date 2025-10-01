import { Schema as S } from "effect"
import { UserId } from "./id.vo"
import { Role, RoleSchema } from "../schema/access-policy.schema"


/**
 * JWT payload schema using Effect Schema for consistent validation.
 */
export const JwtPayloadSchema = S.Struct({
  sub: S.String.pipe(S.filter((s) => s.length > 0, { message: () => "JWT payload must contain subject (sub)" })),
  email: S.String.pipe(S.filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), { message: () => "JWT payload must contain valid email" })),
  roles: S.Array(RoleSchema), // Single roles array - no backward compatibility
  iat: S.Number.pipe(S.filter((n) => n > 0, { message: () => "JWT payload must contain valid issued at time" })),
  exp: S.Number.pipe(S.filter((n) => n > 0, { message: () => "JWT payload must contain valid expiration time" }))
}).pipe(
  S.filter(
    (data) => data.exp > data.iat,
    { message: () => "JWT payload must contain valid expiration time" }
  )
)
export type JwtPayload = S.Schema.Type<typeof JwtPayloadSchema>

// Factory function for creating JwtPayload from unknown input using Effect pipeline
export const makeJwtPayload = (input: unknown) => S.decodeUnknown(JwtPayloadSchema)(input)

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
    const validatedPayload = S.decodeUnknownSync(JwtPayloadSchema)(payload);
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

  get roles(): readonly Role[] {
    return this._payload.roles;
  }

  isExpired(currentTime: number = Date.now()): boolean {
    return this._payload.exp * 1000 < currentTime;
  }

  expiresIn(currentTime: number = Date.now()): number {
    return Math.max(0, this._payload.exp * 1000 - currentTime);
  }
}

