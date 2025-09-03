import jwt from "jsonwebtoken";
import { Result, ok, err } from "../../shared/result/result";
import { JwtService, TokenPayload } from "../../application/ports/jwt.service";
import { Jwt, JwtPayload } from "../../domain/value-objects/jwt.vo";

/**
 * JWT service implementation using jsonwebtoken library.
 * Handles token generation and verification.
 */
export class JwtServiceImpl implements JwtService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string = "15m"
  ) {
    if (!secret || secret.length < 32) {
      throw new Error("JWT secret must be at least 32 characters long");
    }
    // Validate expiresIn format at construction time
    this.parseExpiresIn(expiresIn);
  }

  async generateToken(payload: TokenPayload): Promise<Result<string, Error>> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const expiresInSeconds = this.parseExpiresIn(this.expiresIn);
      
      const jwtPayload: JwtPayload = {
        sub: payload.userId,
        email: payload.email,
        role: payload.role,
        iat: now,
        exp: now + expiresInSeconds
      };

      const token = jwt.sign(jwtPayload, this.secret, {
        algorithm: "HS256"
      });

      return ok(token);
    } catch {
      return err(new Error("Failed to generate JWT token"));
    }
  }

  async verifyToken(token: string): Promise<Result<Jwt, Error>> {
    try {
      const decoded = jwt.verify(token, this.secret, {
        algorithms: ["HS256"]
      }) as JwtPayload;

      // Validate the decoded payload structure
      if (!this.isValidJwtPayload(decoded)) {
        return err(new Error("Invalid JWT payload structure"));
      }

      const jwtValue = Jwt.create(decoded, token);
      return ok(jwtValue);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return err(new Error("JWT token has expired"));
      }
      if (error instanceof jwt.JsonWebTokenError) {
        return err(new Error("Invalid JWT token"));
      }
      return err(new Error("Failed to verify JWT token"));
    }
  }

  private parseExpiresIn(expiresIn: string): number {
    // Parse duration strings like "15m", "1h", "7d"
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error("Invalid expiresIn format. Use format like '15m', '1h', '7d'");
    }

    const value = parseInt(match[1] || "0", 10);
    const unit = match[2];

    switch (unit) {
      case "s": return value;
      case "m": return value * 60;
      case "h": return value * 60 * 60;
      case "d": return value * 60 * 60 * 24;
      default: throw new Error("Invalid time unit");
    }
  }

  private isValidJwtPayload(payload: any): payload is JwtPayload {
    return (
      typeof payload === "object" &&
      typeof payload.sub === "string" &&
      typeof payload.email === "string" &&
      (payload.role === "admin" || payload.role === "user") &&
      typeof payload.iat === "number" &&
      typeof payload.exp === "number"
    );
  }
}
