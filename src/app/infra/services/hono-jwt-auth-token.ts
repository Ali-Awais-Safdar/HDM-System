import { Effect, Option } from "effect"
import { sign } from "hono/jwt"
import { AuthTokenPort, AuthTokenError, TokenPayload, GeneratedToken } from "@application/services/ports/auth-token.port"
import { JWT_CONFIG } from "@infra/config/http-config"

export class HonoJWTAuthToken extends AuthTokenPort {
  constructor(
    private readonly secret: string = JWT_CONFIG.SECRET,
    private readonly expiresIn: string = JWT_CONFIG.EXPIRES_IN,
    private readonly algorithm: string = JWT_CONFIG.ALGORITHM
  ) {
    super()
  }

  generateToken(payload: TokenPayload): Effect.Effect<GeneratedToken, AuthTokenError> {
    const secret = this.secret
    const expiresIn = this.expiresIn
    const algorithm = this.algorithm

    return Effect.gen(function* () {
      const now = Math.floor(Date.now() / 1000)
      const expiresInSeconds = yield* Effect.sync(() => parseExpiresIn(expiresIn))

      // Encode Option<WorkspaceId> to undefined for JWT
      // When Option.none(), workspaceId should be undefined (will be omitted from JWT)
      // When Option.some(value), include the workspace ID
      const workspaceIdEncoded = Option.match(payload.workspaceId, {
        onNone: () => undefined,
        onSome: (wid) => wid as string
      })

      // Build JWT payload - workspaceId will be undefined if not present (won't appear in token)
      const jwtPayloadToSign: Record<string, unknown> = {
        sub: payload.userId,
        roles: payload.roles,
        iat: now,
        exp: now + expiresInSeconds,
        jti: crypto.randomUUID()
      }

      // Only include workspaceId if it exists
      if (workspaceIdEncoded !== undefined) {
        jwtPayloadToSign.workspaceId = workspaceIdEncoded
      }

      const token = yield* Effect.tryPromise({
        try: () => sign(
          jwtPayloadToSign,
          secret,
          algorithm as any
        ),
        catch: (error) => new AuthTokenError(
          `Failed to generate token: ${error instanceof Error ? error.message : String(error)}`,
          "SIGN"
        )
      })

      const expiresAt = new Date((now + expiresInSeconds) * 1000)

      return { token, expiresAt }
    })
  }
}

function parseExpiresIn(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/)
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`)
  }

  const value = parseInt(match[1]!, 10)
  const unit = match[2]!

  switch (unit) {
    case 's': return value
    case 'm': return value * 60
    case 'h': return value * 60 * 60
    case 'd': return value * 24 * 60 * 60
    default: throw new Error(`Invalid duration unit: ${unit}`)
  }
}