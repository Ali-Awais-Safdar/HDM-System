import { Effect } from "effect"
import { UserId, WorkspaceId } from "@domain/refined/ids"
import { Role } from "@domain/accessPolicy/access-policy.schema"
import { Option } from "effect"

export class AuthTokenError extends Error {
  readonly _tag = "AuthTokenError" as const
  readonly code = "AUTH_TOKEN_ERROR"
  
  constructor(
    message: string,
    public readonly operation: "SIGN" | "VERIFY"
  ) {
    super(message)
    this.name = "AuthTokenError"
  }
}

export interface TokenPayload {
  userId: UserId
  workspaceId: Option.Option<WorkspaceId>
  roles: readonly Role[]
}

export interface GeneratedToken {
  token: string
  expiresAt: Date
}

export abstract class AuthTokenPort {
  abstract generateToken(payload: TokenPayload): Effect.Effect<GeneratedToken, AuthTokenError>
}