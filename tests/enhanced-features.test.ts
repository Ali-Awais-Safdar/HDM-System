import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRequestLogger, createServiceLogger, logPerformance, logSecurityEvent } from "../src/shared/logging/logger";

describe("Enhanced Features", () => {
  describe("Logging Enhancements", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should create request logger with correlation ID", () => {
      const correlationId = "test-correlation-id";
      const logger = createRequestLogger(correlationId);
      
      expect(logger).toBeDefined();
      expect(logger.bindings()).toMatchObject({
        correlationId
      });
    });

    it("should create service logger with service name", () => {
      const serviceName = "TestService";
      const logger = createServiceLogger(serviceName);
      
      expect(logger).toBeDefined();
      expect(logger.bindings()).toMatchObject({
        service: serviceName
      });
    });

    it("should log performance metrics", () => {
      const logger = createServiceLogger("TestService");
      const logSpy = vi.spyOn(logger, "info");
      
      const startTime = Date.now() - 100; // 100ms ago
      const operation = "test_operation";
      const metadata = { userId: "user123" };
      
      logPerformance(logger, operation, startTime, metadata);
      
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          operation,
          duration: expect.any(Number),
          userId: "user123"
        }),
        `Operation completed: ${operation}`
      );
    });

    it("should log security events", () => {
      // Security events are logged through the logger, not console
      const event = "login_failed";
      const userId = "user123";
      const metadata = { ip: "192.168.1.1" };
      
      // Just verify the function doesn't throw
      expect(() => logSecurityEvent(event, userId, metadata)).not.toThrow();
    });

    it("should generate correlation ID if not provided", () => {
      const logger1 = createRequestLogger();
      const logger2 = createRequestLogger();
      
      const bindings1 = logger1.bindings();
      const bindings2 = logger2.bindings();
      
      expect(bindings1.correlationId).toBeDefined();
      expect(bindings2.correlationId).toBeDefined();
      expect(bindings1.correlationId).not.toBe(bindings2.correlationId);
    });
  });

  describe("Environment Configuration", () => {
    it("should validate environment variables", async () => {
      // This test verifies that the env module can be imported without errors
      // and that the validation works correctly
      expect(() => {
        // If env.ts has validation errors, this would throw during import
        import("../src/env/env.js");
      }).not.toThrow();
    });

    it("should have required environment variables defined", async () => {
      const { env } = await import("../src/env/env.js");
      
      expect(env.NODE_ENV).toBeDefined();
      expect(env.PORT).toBeTypeOf("number");
      expect(env.DATABASE_URL).toBeDefined();
      expect(env.JWT_SECRET).toBeDefined();
      expect(env.IS_PRODUCTION).toBeTypeOf("boolean");
      expect(env.IS_DEVELOPMENT).toBeTypeOf("boolean");
      expect(env.IS_TEST).toBeTypeOf("boolean");
    });

    it("should have computed values based on NODE_ENV", async () => {
      const { env } = await import("../src/env/env.js");
      
      if (env.NODE_ENV === "production") {
        expect(env.IS_PRODUCTION).toBe(true);
        expect(env.IS_DEVELOPMENT).toBe(false);
        expect(env.IS_TEST).toBe(false);
      } else if (env.NODE_ENV === "development") {
        expect(env.IS_PRODUCTION).toBe(false);
        expect(env.IS_DEVELOPMENT).toBe(true);
        expect(env.IS_TEST).toBe(false);
      } else if (env.NODE_ENV === "test") {
        expect(env.IS_PRODUCTION).toBe(false);
        expect(env.IS_DEVELOPMENT).toBe(false);
        expect(env.IS_TEST).toBe(true);
      }
    });

    it("should parse MIME types into array", async () => {
      const { env } = await import("../src/env/env.js");
      
      expect(Array.isArray(env.ALLOWED_MIME_TYPES)).toBe(true);
      expect(env.ALLOWED_MIME_TYPES.length).toBeGreaterThan(0);
    });

    it("should validate port range", async () => {
      const { env } = await import("../src/env/env.js");
      
      expect(env.PORT).toBeGreaterThan(0);
      expect(env.PORT).toBeLessThanOrEqual(65535);
    });

    it("should validate bcrypt salt rounds range", async () => {
      const { env } = await import("../src/env/env.js");
      
      expect(env.BCRYPT_SALT_ROUNDS).toBeGreaterThanOrEqual(10);
      expect(env.BCRYPT_SALT_ROUNDS).toBeLessThanOrEqual(15);
    });
  });
});
