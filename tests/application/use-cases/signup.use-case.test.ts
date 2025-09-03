import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignupUseCase } from "../../../src/application/use-cases/signup.use-case";
import { AuthService } from "../../../src/domain/services/auth.service";
import { JwtService } from "../../../src/application/ports/jwt.service";
import { User } from "../../../src/domain/entities/user.entity";
import { ok, err } from "../../../src/shared/result/result";
import { asEmailAddress, newUserId } from "../../../src/shared/types/brand";

describe("SignupUseCase", () => {
  let signupUseCase: SignupUseCase;
  let mockAuthService: AuthService;
  let mockJwtService: JwtService;

  beforeEach(() => {
    // Create mocks
    mockAuthService = {
      signup: vi.fn(),
      login: vi.fn(),
      createAdminUser: vi.fn()
    } as any;

    mockJwtService = {
      generateToken: vi.fn(),
      verifyToken: vi.fn()
    } as any;

    signupUseCase = new SignupUseCase(mockAuthService, mockJwtService);
  });

  describe("successful signup", () => {
    it("should create user and return access token", async () => {
      // Arrange
      const request = {
        email: "test@example.com",
        password: "SecurePass123!",
        role: "user" as const
      };

      const mockUser = User.create({
        id: newUserId(),
        email: asEmailAddress("test@example.com"),
        passwordHash: "hashed_password",
        role: "user"
      });

      const mockToken = "mock.jwt.token";

      vi.mocked(mockAuthService.signup).mockResolvedValue(ok(mockUser));
      vi.mocked(mockJwtService.generateToken).mockResolvedValue(ok(mockToken));

      // Act
      const result = await signupUseCase.execute(request);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBe(mockToken);
        expect(result.value.user.email).toBe("test@example.com");
        expect(result.value.user.role).toBe("user");
        expect(result.value.user.id).toBe(mockUser.id);
      }

      expect(mockAuthService.signup).toHaveBeenCalledWith(
        expect.objectContaining({ value: "test@example.com" }),
        expect.objectContaining({ value: "SecurePass123!" }),
        "user"
      );
    });

    it("should handle admin role signup", async () => {
      // Arrange
      const request = {
        email: "admin@example.com",
        password: "AdminPass123!",
        role: "admin" as const
      };

      const mockUser = User.create({
        id: newUserId(),
        email: asEmailAddress("admin@example.com"),
        passwordHash: "hashed_password",
        role: "admin"
      });

      const mockToken = "admin.jwt.token";

      vi.mocked(mockAuthService.signup).mockResolvedValue(ok(mockUser));
      vi.mocked(mockJwtService.generateToken).mockResolvedValue(ok(mockToken));

      // Act
      const result = await signupUseCase.execute(request);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.user.role).toBe("admin");
      }
    });

    it("should default to user role when not specified", async () => {
      // Arrange
      const request = {
        email: "test@example.com",
        password: "SecurePass123!"
      };

      const mockUser = User.create({
        id: newUserId(),
        email: asEmailAddress("test@example.com"),
        passwordHash: "hashed_password",
        role: "user"
      });

      const mockToken = "mock.jwt.token";

      vi.mocked(mockAuthService.signup).mockResolvedValue(ok(mockUser));
      vi.mocked(mockJwtService.generateToken).mockResolvedValue(ok(mockToken));

      // Act
      await signupUseCase.execute(request);

      // Assert
      expect(mockAuthService.signup).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        "user"
      );
    });
  });

  describe("error handling", () => {
    it("should return error when auth service fails", async () => {
      // Arrange
      const request = {
        email: "test@example.com",
        password: "SecurePass123!"
      };

      const authError = new Error("User already exists");
      vi.mocked(mockAuthService.signup).mockResolvedValue(err(authError));

      // Act
      const result = await signupUseCase.execute(request);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("User already exists");
      }
    });

    it("should return error when JWT generation fails", async () => {
      // Arrange
      const request = {
        email: "test@example.com",
        password: "SecurePass123!"
      };

      const mockUser = User.create({
        id: newUserId(),
        email: asEmailAddress("test@example.com"),
        passwordHash: "hashed_password",
        role: "user"
      });

      const jwtError = new Error("JWT generation failed");
      vi.mocked(mockAuthService.signup).mockResolvedValue(ok(mockUser));
      vi.mocked(mockJwtService.generateToken).mockResolvedValue(err(jwtError));

      // Act
      const result = await signupUseCase.execute(request);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Failed to generate access token");
      }
    });

    it("should handle invalid email format", async () => {
      // Arrange
      const request = {
        email: "invalid-email",
        password: "SecurePass123!"
      };

      // Act
      const result = await signupUseCase.execute(request);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("Invalid email format");
      }
    });

    it("should handle invalid password", async () => {
      // Arrange
      const request = {
        email: "test@example.com",
        password: "weak"
      };

      // Act & Assert
      const result = await signupUseCase.execute(request);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("Password must be at least 8 characters long");
      }
    });
  });
});
