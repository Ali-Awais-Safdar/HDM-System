import { Result, ok, err } from "../../shared/result/result";
import { AuthService } from "../../domain/services/auth.service";
import { Email } from "../../domain/value-objects/email.vo";
import { Password } from "../../domain/value-objects/password.vo";
import { UserRole, Role } from "../../domain/entities/user.entity";
import { JwtService } from "../ports/jwt.service";
import { createServiceLogger, logPerformance, logSecurityEvent } from "../../shared/logging/logger";

// Helper function to map old role to new roles array
const mapRoleToRoles = (role: UserRole): Role[] => {
  switch (role) {
    case "admin":
      return ["ADMIN"];
    case "user":
      return ["VIEWER"];
    default:
      return ["VIEWER"];
  }
};

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
  private readonly logger = createServiceLogger('LoginUseCase');
  
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService
  ) {}

  async execute(request: LoginRequest): Promise<Result<LoginResponse, LoginError>> {
    const startTime = Date.now();
    const email = request.email;
    
    try {
      this.logger.info({ email }, "Starting login attempt");
      
      // Create value objects
      const emailResult = Email.create(request.email);
      if (!emailResult.ok) {
        this.logger.warn({ email, error: emailResult.error.message }, "Invalid email format");
        return err(new LoginError("Invalid credentials"));
      }

      const passwordResult = Password.create(request.password);
      if (!passwordResult.ok) {
        this.logger.warn({ email, error: passwordResult.error.message }, "Invalid password format");
        return err(new LoginError("Invalid credentials"));
      }

      // Execute login
      const loginResult = await this.authService.login(emailResult.value, passwordResult.value);
      if (!loginResult.ok) {
        logSecurityEvent("login_failed", undefined, {
          email,
          reason: "invalid_credentials",
          duration: Date.now() - startTime
        });
        
        this.logger.warn({ email }, "Login failed: invalid credentials");
        return err(new LoginError("Invalid credentials"));
      }

      const user = loginResult.value;
      this.logger.info({ userId: user.id, email }, "User authenticated successfully");

      // Generate JWT token
      const tokenResult = await this.jwtService.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        roles: mapRoleToRoles(user.role)
      });

      if (!tokenResult.ok) {
        this.logger.error({ userId: user.id, email }, "Failed to generate JWT token");
        return err(new LoginError("Failed to generate access token"));
      }

      // Log successful login
      logPerformance(this.logger, 'user_login', startTime, {
        userId: user.id,
        email,
        role: user.role
      });

      logSecurityEvent("login_successful", user.id, {
        email,
        role: user.role,
        duration: Date.now() - startTime
      });

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
      this.logger.error({ email, error }, "Unexpected error during login");
      
      logSecurityEvent("login_error", undefined, {
        email,
        error: error instanceof Error ? error.message : 'unknown_error',
        duration: Date.now() - startTime
      });
      
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
