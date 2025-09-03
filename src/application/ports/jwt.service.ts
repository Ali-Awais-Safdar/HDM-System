import { Result } from "../../shared/result/result";
import { UserId } from "../../shared/types/brand";
import { UserRole } from "../../domain/entities/user.entity";
import { Jwt } from "../../domain/value-objects/jwt.vo";

export interface TokenPayload {
  userId: UserId;
  email: string;
  role: UserRole;
}

export interface JwtService {
  generateToken(payload: TokenPayload): Promise<Result<string, Error>>;
  verifyToken(token: string): Promise<Result<Jwt, Error>>;
}
