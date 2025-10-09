import { Effect } from "effect"
import { Role } from "@domain/accessPolicy/access-policy.schema"
import { Jwt } from "@application/services/jwt.vo"
import { UserId } from "@shared/types/brand"

export interface TokenPayload {
  userId: UserId
  email: string
  roles: readonly Role[]
}

export class JwtError extends Error {
  readonly _tag = "JwtError" as const
  
  constructor(
    message: string,
    public readonly code: "GENERATION_FAILED" | "VERIFICATION_FAILED" | "EXPIRED" | "INVALID" = "INVALID"
  ) {
    super(message)
    this.name = "JwtError"
  }
}

export abstract class JwtService {
  abstract generateToken(payload: TokenPayload): Effect.Effect<string, JwtError>
  abstract verifyToken(token: string): Effect.Effect<Jwt, JwtError>
}
