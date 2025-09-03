import { UserId } from "../../shared/types/brand";
import { UserRole } from "../entities/user.entity";

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

export class Jwt {
  private constructor(
    private readonly _payload: JwtPayload,
    private readonly _token: string
  ) {}

  static create(payload: JwtPayload, token: string): Jwt {
    Jwt.validate(payload);
    return new Jwt(payload, token);
  }

  private static validate(payload: JwtPayload): void {
    if (!payload.sub) {
      throw new Error("JWT payload must contain subject (sub)");
    }
    
    if (!payload.email) {
      throw new Error("JWT payload must contain email");
    }
    
    if (!payload.role || !["admin", "user"].includes(payload.role)) {
      throw new Error("JWT payload must contain valid role");
    }
    
    if (!payload.iat || payload.iat <= 0) {
      throw new Error("JWT payload must contain valid issued at time");
    }
    
    if (!payload.exp || payload.exp <= payload.iat) {
      throw new Error("JWT payload must contain valid expiration time");
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
