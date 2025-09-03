import { Result, ok, err } from "../../shared/result/result";
import { AuthService } from "../../domain/services/auth.service";
import { Email } from "../../domain/value-objects/email.vo";
import { Password } from "../../domain/value-objects/password.vo";
import { UserRole } from "../../domain/entities/user.entity";
import { JwtService } from "../ports/jwt.service";

export interface SignupRequest {
  email: string;
  password: string;
  role?: UserRole;
}

export interface SignupResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    createdAt: Date;
  };
}

export class SignupUseCase {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService
  ) {}

  async execute(request: SignupRequest): Promise<Result<SignupResponse, SignupError>> {
    try {
      // Create value objects
      const email = Email.create(request.email);
      const password = Password.create(request.password);
      const role = request.role || "user";

      // Validate role permissions (only admins can create admin users)
      if (role === "admin") {
        // In a real application, this would check if the current user is an admin
        // For now, we'll allow it for initial admin seeding
        // TODO: Add current user context and permission check
      }

      // Execute signup
      const signupResult = await this.authService.signup(email, password, role);
      if (!signupResult.ok) {
        return err(new SignupError(signupResult.error.message));
      }

      const user = signupResult.value;

      // Generate JWT token
      const tokenResult = await this.jwtService.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role
      });

      if (!tokenResult.ok) {
        return err(new SignupError("Failed to generate access token"));
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
        return err(new SignupError(error.message));
      }
      return err(new SignupError("An unexpected error occurred during signup"));
    }
  }
}

export class SignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignupError";
  }
}
