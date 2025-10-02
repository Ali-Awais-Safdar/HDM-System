import jwt from "jsonwebtoken"
import { Effect } from "effect"
import { JwtService, TokenPayload, JwtError } from "../../application/ports/jwt.service"
import { Jwt, JwtPayload } from "../../domain/value-objects/jwt.vo"

export class JwtServiceImpl extends JwtService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string = "15m"
  ) {
    super()
    if (!secret || secret.length < 32) {
      throw new Error("JWT secret must be at least 32 characters long")
    }
    this.parseExpiresIn(expiresIn)
  }

  generateToken(payload: TokenPayload): Effect.Effect<string, JwtError> {
    return Effect.try({
      try: () => {
        const now = Math.floor(Date.now() / 1000)
        const expiresInSeconds = this.parseExpiresIn(this.expiresIn)
        
        const jwtPayload: JwtPayload = {
          sub: payload.userId,
          email: payload.email,
          roles: payload.roles,
          iat: now,
          exp: now + expiresInSeconds
        }

        return jwt.sign(jwtPayload, this.secret, {
          algorithm: "HS256"
        })
      },
      catch: (error) => new JwtError(
        error instanceof Error ? error.message : "Failed to generate JWT token",
        "GENERATION_FAILED"
      )
    })
  }

  verifyToken(token: string): Effect.Effect<Jwt, JwtError> {
    return Effect.try({
      try: () => {
        const decoded = jwt.verify(token, this.secret, {
          algorithms: ["HS256"]
        }) as JwtPayload

        if (!this.isValidJwtPayload(decoded)) {
          throw new JwtError("Invalid JWT payload structure", "INVALID")
        }

        return Jwt.create(decoded, token)
      },
      catch: (error) => {
        if (error instanceof jwt.TokenExpiredError) {
          return new JwtError("JWT token has expired", "EXPIRED")
        }
        if (error instanceof jwt.JsonWebTokenError) {
          return new JwtError("Invalid JWT token", "INVALID")
        }
        if (error instanceof JwtError) {
          return error
        }
        return new JwtError(
          error instanceof Error ? error.message : "Failed to verify JWT token",
          "VERIFICATION_FAILED"
        )
      }
    })
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/)
    if (!match) {
      throw new Error("Invalid expiresIn format. Use format like '15m', '1h', '7d'")
    }

    const value = parseInt(match[1] || "0", 10)
    const unit = match[2]

    switch (unit) {
      case "s": return value
      case "m": return value * 60
      case "h": return value * 60 * 60
      case "d": return value * 60 * 60 * 24
      default: throw new Error("Invalid time unit")
    }
  }

  private isValidJwtPayload(payload: unknown): payload is JwtPayload {
    if (typeof payload !== "object" || payload === null) return false
    
    const p = payload as Record<string, unknown>
    
    return (
      typeof p.sub === "string" &&
      typeof p.email === "string" &&
      Array.isArray(p.roles) &&
      p.roles.every((r: unknown) => r === "ADMIN" || r === "USER") &&
      typeof p.iat === "number" &&
      typeof p.exp === "number"
    )
  }
}
