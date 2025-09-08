import { Result, ok, err } from "../../shared/result/result";
import { AuthService } from "../../domain/services/auth.service";
import { Email } from "../../domain/value-objects/email.vo";
import { Password } from "../../domain/value-objects/password.vo";
import { UserRole } from "../../domain/entities/user.entity";
import { JwtService } from "../ports/jwt.service";
import { createServiceLogger, logPerformance, logSecurityEvent } from "../../shared/logging/logger";

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
  private readonly logger = createServiceLogger('SignupUseCase');
  
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService
  ) {}

  async execute(request: SignupRequest): Promise<Result<SignupResponse, SignupError>> {
    const startTime = Date.now();
    const email = request.email;
    
    try {
      this.logger.info({ email, role: request.role }, "Starting user signup");
      
      // Create value objects
      const emailResult = Email.create(request.email);
      if (!emailResult.ok) {
        this.logger.warn({ email, error: emailResult.error.message }, "Invalid email format");
        return err(new SignupError("Invalid email format"));
      }

      const passwordResult = Password.create(request.password);
      if (!passwordResult.ok) {
        this.logger.warn({ email, error: passwordResult.error.message }, "Invalid password format");
        return err(new SignupError(passwordResult.error.message));
      }

      const role = request.role || "user";

      // Validate role permissions (only admins can create admin users)
      if (role === "admin") {
        // In a real application, this would check if the current user is an admin
        // For now, we'll allow it for initial admin seeding
        // TODO: Add current user context and permission check
        this.logger.warn({ email, role }, "Admin user creation attempted");
      }

      // Execute signup
      const signupResult = await this.authService.signup(emailResult.value, passwordResult.value, role);
      if (!signupResult.ok) {
        logSecurityEvent("signup_failed", undefined, {
          email,
          reason: "user_creation_failed",
          duration: Date.now() - startTime
        });
        
        this.logger.warn({ email, error: signupResult.error.message }, "Signup failed: user creation failed");
        return err(new SignupError(signupResult.error.message));
      }

      const user = signupResult.value;
      this.logger.info({ userId: user.id, email, role }, "User created successfully");

      // Generate JWT token
      const tokenResult = await this.jwtService.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role
      });

      if (!tokenResult.ok) {
        this.logger.error({ userId: user.id, email }, "Failed to generate JWT token during signup");
        return err(new SignupError("Failed to generate access token"));
      }

      // Log successful signup
      logPerformance(this.logger, 'user_signup', startTime, {
        userId: user.id,
        email,
        role: user.role
      });

      logSecurityEvent("signup_successful", user.id, {
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
      this.logger.error({ email, error }, "Unexpected error during signup");
      
      logSecurityEvent("signup_error", undefined, {
        email,
        error: error instanceof Error ? error.message : 'unknown_error',
        duration: Date.now() - startTime
      });
      
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
