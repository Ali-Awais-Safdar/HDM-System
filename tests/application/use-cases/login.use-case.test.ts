import { describe, it, expect, vi, beforeEach } from "vitest";
import { LoginUseCase } from "../../../src/application/use-cases/login.use-case";
import { AuthService } from "../../../src/domain/services/auth.service";
import { JwtService } from "../../../src/application/ports/jwt.service";
import { User } from "../../../src/domain/entities/user.entity";
import { ok, err } from "../../../src/shared/result/result";
import { asEmailAddress, newUserId } from "../../../src/shared/types/brand";

describe("LoginUseCase", () => {
  let loginUseCase: LoginUseCase;
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

    loginUseCase = new LoginUseCase(mockAuthService, mockJwtService);
  });

  describe("successful login", () => {
    it("should authenticate user and return access token", async () => {
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

      vi.mocked(mockAuthService.login).mockResolvedValue(ok(mockUser));
      vi.mocked(mockJwtService.generateToken).mockResolvedValue(ok(mockToken));

      // Act
      const result = await loginUseCase.execute(request);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessToken).toBe(mockToken);
        expect(result.value.user.email).toBe("test@example.com");
        expect(result.value.user.role).toBe("user");
        expect(result.value.user.id).toBe(mockUser.id);
      }

      expect(mockAuthService.login).toHaveBeenCalledWith(
        expect.objectContaining({ value: "test@example.com" }),
        expect.objectContaining({ value: "SecurePass123!" })
      );
    });

    it("should handle admin user login", async () => {
      // Arrange
      const request = {
        email: "admin@example.com",
        password: "AdminPass123!"
      };

      const mockUser = User.create({
        id: newUserId(),
        email: asEmailAddress("admin@example.com"),
        passwordHash: "hashed_password",
        role: "admin"
      });

      const mockToken = "admin.jwt.token";

      vi.mocked(mockAuthService.login).mockResolvedValue(ok(mockUser));
      vi.mocked(mockJwtService.generateToken).mockResolvedValue(ok(mockToken));

      // Act
      const result = await loginUseCase.execute(request);

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.user.role).toBe("admin");
      }
    });
  });

  describe("error handling", () => {
    it("should return error when auth service fails", async () => {
      // Arrange
      const request = {
        email: "test@example.com",
        password: "WrongPassword123!"
      };

      const authError = new Error("Invalid credentials");
      vi.mocked(mockAuthService.login).mockResolvedValue(err(authError));

      // Act
      const result = await loginUseCase.execute(request);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Invalid credentials");
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
      vi.mocked(mockAuthService.login).mockResolvedValue(ok(mockUser));
      vi.mocked(mockJwtService.generateToken).mockResolvedValue(err(jwtError));

      // Act
      const result = await loginUseCase.execute(request);

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
      const result = await loginUseCase.execute(request);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Invalid credentials");
      }
    });

    it("should handle password validation during login", async () => {
      // Arrange
      const request = {
        email: "test@example.com",
        password: "weak"
      };

      // Act
      const result = await loginUseCase.execute(request);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Invalid credentials");
      }
    });
  });

  describe("security", () => {
    it("should mask authentication errors to prevent user enumeration", async () => {
      // Arrange
      const request = {
        email: "nonexistent@example.com",
        password: "SecurePass123!"
      };

      vi.mocked(mockAuthService.login).mockResolvedValue(err(new Error("User not found")));

      // Act
      const result = await loginUseCase.execute(request);

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Error should be generic to prevent user enumeration
        expect(result.error.message).toBe("Invalid credentials");
      }
    });
  });
});
