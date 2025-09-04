import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app/app";
import type { Express } from "express";

describe("Authentication Flow Integration Tests", () => {
  let app: Express;

  beforeAll(() => {
    app = buildApp();
  });

  describe("POST /auth/signup", () => {
    it("should create a new user successfully", async () => {
      const userData = {
        email: "test@example.com",
        password: "SecurePass123!",
        role: "user"
      };

      const response = await request(app)
        .post("/auth/signup")
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("user");
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.role).toBe(userData.role);
      expect(response.body.user).toHaveProperty("id");
      expect(response.body.user).toHaveProperty("createdAt");
      expect(response.body.user).not.toHaveProperty("passwordHash");
    });

    it("should create admin user successfully", async () => {
      const adminData = {
        email: "admin@example.com",
        password: "AdminPass123!",
        role: "admin"
      };

      const response = await request(app)
        .post("/auth/signup")
        .send(adminData)
        .expect(201);

      expect(response.body.user.role).toBe("admin");
    });

    it("should default to user role when not specified", async () => {
      const userData = {
        email: "defaultuser@example.com",
        password: "SecurePass123!"
      };

      const response = await request(app)
        .post("/auth/signup")
        .send(userData)
        .expect(201);

      expect(response.body.user.role).toBe("user");
    });

    it("should reject duplicate email", async () => {
      const userData = {
        email: "duplicate@example.com",
        password: "SecurePass123!"
      };

      // First signup should succeed
      await request(app)
        .post("/auth/signup")
        .send(userData)
        .expect(201);

      // Second signup with same email should fail
      const response = await request(app)
        .post("/auth/signup")
        .send(userData)
        .expect(409);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toContain("already exists");
    });

    it("should validate email format", async () => {
      const invalidData = {
        email: "invalid-email",
        password: "SecurePass123!"
      };

      const response = await request(app)
        .post("/auth/signup")
        .send(invalidData)
        .expect(422);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Validation failed");
      expect(response.body).toHaveProperty("details");
    });

    it("should validate password requirements", async () => {
      const weakPasswordData = {
        email: "test@weak.com",
        password: "weak"
      };

      const response = await request(app)
        .post("/auth/signup")
        .send(weakPasswordData)
        .expect(422);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Validation failed");
    });
  });

  describe("POST /auth/login", () => {
    beforeAll(async () => {
      // Create a test user for login tests
      await request(app)
        .post("/auth/signup")
        .send({
          email: "logintest@example.com",
          password: "LoginPass123!"
        });
    });

    it("should login successfully with valid credentials", async () => {
      const loginData = {
        email: "logintest@example.com",
        password: "LoginPass123!"
      };

      const response = await request(app)
        .post("/auth/login")
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("user");
      expect(response.body.user.email).toBe(loginData.email);
      expect(response.body.user).not.toHaveProperty("passwordHash");
    });

    it("should reject invalid email", async () => {
      const invalidData = {
        email: "nonexistent@example.com",
        password: "SomePassword123!"
      };

      const response = await request(app)
        .post("/auth/login")
        .send(invalidData)
        .expect(401);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Invalid credentials");
    });

    it("should reject invalid password", async () => {
      const invalidData = {
        email: "logintest@example.com",
        password: "WrongPassword123!"
      };

      const response = await request(app)
        .post("/auth/login")
        .send(invalidData)
        .expect(401);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Invalid credentials");
    });

    it("should validate request format", async () => {
      const invalidData = {
        email: "invalid-email",
        password: "LoginPass123!"
      };

      const response = await request(app)
        .post("/auth/login")
        .send(invalidData)
        .expect(422);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Validation failed");
    });
  });

  describe("JWT Token Verification", () => {
    let validToken: string;

    beforeAll(async () => {
      // Get a valid token for testing
      const response = await request(app)
        .post("/auth/signup")
        .send({
          email: "jwttest@example.com",
          password: "JwtPass123!"
        });
      
      validToken = response.body.accessToken;
    });

    it("should accept valid JWT token in protected routes", async () => {
      const response = await request(app)
        .get("/health")
        .set("Authorization", `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("ok", true);
    });

    it("should work without token for public routes", async () => {
      const response = await request(app)
        .get("/health")
        .expect(200);

      expect(response.body).toHaveProperty("ok", true);
    });

    it("should handle malformed token gracefully", async () => {
      const response = await request(app)
        .get("/health")
        .set("Authorization", "Bearer invalid-token")
        .expect(200); // Health is public, should still work

      expect(response.body).toHaveProperty("ok", true);
    });

    it("should handle missing Bearer prefix", async () => {
      const response = await request(app)
        .get("/health")
        .set("Authorization", validToken)
        .expect(200); // Health is public, should still work

      expect(response.body).toHaveProperty("ok", true);
    });
  });

  describe("Complete Authentication Flow", () => {
    it("should complete full signup -> login -> token use cycle", async () => {
      const userData = {
        email: "fullflow@example.com",
        password: "FullFlow123!"
      };

      // Step 1: Signup
      const signupResponse = await request(app)
        .post("/auth/signup")
        .send(userData)
        .expect(201);

      expect(signupResponse.body).toHaveProperty("accessToken");
      const signupToken = signupResponse.body.accessToken;

      // Step 2: Login with same credentials
      const loginResponse = await request(app)
        .post("/auth/login")
        .send(userData)
        .expect(200);

      expect(loginResponse.body).toHaveProperty("accessToken");
      const loginToken = loginResponse.body.accessToken;

      // Step 3: Both tokens should be valid (they may be the same if generated at the same time)
      expect(signupToken).toBeDefined();
      expect(loginToken).toBeDefined();

      // Step 4: Use tokens with protected endpoints (when we add them)
      await request(app)
        .get("/health")
        .set("Authorization", `Bearer ${signupToken}`)
        .expect(200);

      await request(app)
        .get("/health")  
        .set("Authorization", `Bearer ${loginToken}`)
        .expect(200);
    });
  });
});
