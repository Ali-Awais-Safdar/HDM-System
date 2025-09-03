import { Result, ok, err } from "../../shared/result/result";
import { AuthService } from "../../domain/services/auth.service";
import { Email } from "../../domain/value-objects/email.vo";
import { Password } from "../../domain/value-objects/password.vo";
import { UserRole } from "../../domain/entities/user.entity";
import { JwtService } from "../ports/jwt.service";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    createdAt: Date;
  };
}

export class LoginUseCase {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService
  ) {}

  async execute(request: LoginRequest): Promise<Result<LoginResponse, LoginError>> {
    try {
      // Create value objects
      const email = Email.create(request.email);
      const password = Password.create(request.password);

      // Execute login
      const loginResult = await this.authService.login(email, password);
      if (!loginResult.ok) {
        return err(new LoginError("Invalid credentials"));
      }

      const user = loginResult.value;

      // Generate JWT token
      const tokenResult = await this.jwtService.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role
      });

      if (!tokenResult.ok) {
        return err(new LoginError("Failed to generate access token"));
      }

      return ok({
        accessToken: tokenResult.value,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt
        }
      });

    } catch (error) {
      if (error instanceof Error) {
        return err(new LoginError("Invalid credentials"));
      }
      return err(new LoginError("An unexpected error occurred during login"));
    }
  }
}

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginError";
  }
}
