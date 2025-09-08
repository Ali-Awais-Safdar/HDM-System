import { z } from "zod";
import { UserId } from "../../shared/types/brand";
import { UserRole } from "../entities/user.entity";
import { Result, ok, err } from "../../shared/result/result";

/**
 * JWT payload value object.
 * Represents the claims contained in a JWT token.
 */
export interface JwtPayload {
  readonly sub: UserId;      // Subject (user ID)
  readonly email: string;    // User email
  readonly role: UserRole;   // User role
  readonly iat: number;      // Issued at
  readonly exp: number;      // Expires at
}

/**
 * JWT payload validation schema using Zod for consistent validation.
 */
const jwtPayloadSchema = z.object({
  sub: z.string({
    message: "JWT payload must contain subject (sub)"
  }).min(1, "JWT payload must contain subject (sub)"),
  email: z.string({
    message: "JWT payload must contain email"
  }).email("JWT payload must contain valid email"),
  role: z.enum(["admin", "user"], {
    message: "JWT payload must contain valid role"
  }),
  iat: z.number({
    message: "JWT payload must contain valid issued at time"
  }).positive("JWT payload must contain valid issued at time"),
  exp: z.number({
    message: "JWT payload must contain valid expiration time"
  }).positive("JWT payload must contain valid expiration time")
}).refine(
  (data) => data.exp > data.iat,
  {
    message: "JWT payload must contain valid expiration time",
    path: ["exp"]
  }
);

export class Jwt {
  private constructor(
    private readonly _payload: JwtPayload,
    private readonly _token: string
  ) {}

  static create(payload: JwtPayload, token: string): Result<Jwt, Error> {
    try {
      const validatedPayload = jwtPayloadSchema.parse(payload);
      return ok(new Jwt(validatedPayload as JwtPayload, token));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return err(new Error(error.issues[0]?.message || "Validation error"));
      }
      return err(error as Error);
    }
  }

  get payload(): JwtPayload {
    return this._payload;
  }

  get token(): string {
    return this._token;
  }

  get userId(): UserId {
    return this._payload.sub;
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
