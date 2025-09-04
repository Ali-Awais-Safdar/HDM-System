import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DownloadToken } from "../../../src/domain/entities/download-token.entity";
import { asDocumentId, asUserId, asDownloadTokenId } from "../../../src/shared/types/brand";

describe("DownloadToken Entity", () => {
  const mockDocumentId = asDocumentId("doc-123");
  const mockUserId = asUserId("user-456");

  beforeEach(() => {
    // Mock Date.now() for consistent tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-01-01T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("create", () => {
    it("should create a new download token with specified expiration", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      expect(token.documentId).toBe(mockDocumentId);
      expect(token.issuedTo).toBe(mockUserId);
      expect(token.expiresAt).toBe(expiresAt);
      expect(token.usedAt).toBeNull();
      expect(token.createdAt).toEqual(new Date('2023-01-01T10:00:00Z'));
      expect(token.token).toBeDefined();
      expect(token.token.length).toBeGreaterThan(40); // Base64 encoded 32 bytes should be longer
      expect(token.id).toBeDefined();
    });

    it("should generate unique tokens for each creation", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      
      const token1 = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      const token2 = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      expect(token1.token).not.toBe(token2.token);
      expect(token1.id).not.toBe(token2.id);
    });

    it("should generate URL-safe tokens", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      // URL-safe base64 should not contain +, /, or = characters
      expect(token.token).not.toMatch(/[+/=]/);
    });
  });

  describe("createWithDefaultExpiry", () => {
    it("should create a token with 5-minute default expiration", () => {
      const token = DownloadToken.createWithDefaultExpiry({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
      });

      const expectedExpiry = new Date('2023-01-01T10:05:00Z'); // 5 minutes later
      expect(token.expiresAt).toEqual(expectedExpiry);
    });
  });

  describe("fromPersistence", () => {
    it("should recreate token from persistence data", () => {
      const tokenId = asDownloadTokenId("token-123");
      const tokenString = "secure-token-string";
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      const usedAt = new Date('2023-01-01T10:02:00Z');
      const createdAt = new Date('2023-01-01T10:00:00Z');

      const token = DownloadToken.fromPersistence({
        id: tokenId,
        token: tokenString,
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
        usedAt,
        createdAt,
      });

      expect(token.id).toBe(tokenId);
      expect(token.token).toBe(tokenString);
      expect(token.documentId).toBe(mockDocumentId);
      expect(token.issuedTo).toBe(mockUserId);
      expect(token.expiresAt).toBe(expiresAt);
      expect(token.usedAt).toBe(usedAt);
      expect(token.createdAt).toBe(createdAt);
    });
  });

  describe("isValid", () => {
    it("should return true for unused and non-expired token", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z'); // 5 minutes later
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      expect(token.isValid()).toBe(true);
    });

    it("should return false for expired token", () => {
      const expiresAt = new Date('2023-01-01T09:55:00Z'); // 5 minutes ago
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      expect(token.isValid()).toBe(false);
    });

    it("should return false for used token", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      const usedToken = token.markAsUsed();
      expect(usedToken.isValid()).toBe(false);
    });

    it("should handle clock-skew tolerance in validation", () => {
      const expiresAt = new Date('2023-01-01T09:59:30Z'); // 30 seconds ago
      const clockSkewTolerance = 60000; // 1 minute tolerance
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      // Without clock-skew tolerance, should be invalid
      expect(token.isValid(0)).toBe(false);
      
      // With clock-skew tolerance, should be valid
      expect(token.isValid(clockSkewTolerance)).toBe(true);
    });
  });

  describe("isExpired", () => {
    it("should return false for future expiration", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      expect(token.isExpired()).toBe(false);
    });

    it("should return true for past expiration", () => {
      const expiresAt = new Date('2023-01-01T09:55:00Z');
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      expect(token.isExpired()).toBe(true);
    });

    it("should handle clock-skew tolerance", () => {
      const expiresAt = new Date('2023-01-01T09:59:30Z'); // 30 seconds ago
      const clockSkewTolerance = 60000; // 1 minute tolerance
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      // Without clock-skew tolerance, should be expired
      expect(token.isExpired(0)).toBe(true);
      
      // With clock-skew tolerance, should not be expired
      expect(token.isExpired(clockSkewTolerance)).toBe(false);
    });

    it("should still be expired with clock-skew tolerance if too far past", () => {
      const expiresAt = new Date('2023-01-01T09:50:00Z'); // 10 minutes ago
      const clockSkewTolerance = 60000; // 1 minute tolerance
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      // Even with clock-skew tolerance, should be expired
      expect(token.isExpired(clockSkewTolerance)).toBe(true);
    });
  });

  describe("isUsed", () => {
    it("should return false for unused token", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      expect(token.isUsed()).toBe(false);
    });

    it("should return true for used token", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      const usedToken = token.markAsUsed();
      expect(usedToken.isUsed()).toBe(true);
    });
  });

  describe("markAsUsed", () => {
    it("should return new token instance with usedAt timestamp", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      const usedToken = token.markAsUsed();

      expect(usedToken).not.toBe(token); // Different instance
      expect(usedToken.usedAt).toEqual(new Date('2023-01-01T10:00:00Z'));
      expect(usedToken.token).toBe(token.token); // Same token string
      expect(token.usedAt).toBeNull(); // Original unchanged
    });

    it("should throw error when marking already used token", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      const usedToken = token.markAsUsed();

      expect(() => usedToken.markAsUsed()).toThrow("Token has already been used");
    });
  });

  describe("belongsToUser", () => {
    it("should return true for matching user", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      expect(token.belongsToUser(mockUserId)).toBe(true);
    });

    it("should return false for different user", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      const otherUserId = asUserId("other-user");
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      expect(token.belongsToUser(otherUserId)).toBe(false);
    });
  });

  describe("getTimeToExpiry", () => {
    it("should return remaining time in milliseconds", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z'); // 5 minutes later
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      expect(token.getTimeToExpiry()).toBe(5 * 60 * 1000); // 5 minutes in ms
    });

    it("should return 0 for expired token", () => {
      const expiresAt = new Date('2023-01-01T09:55:00Z'); // 5 minutes ago
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      expect(token.getTimeToExpiry()).toBe(0);
    });

    it("should handle clock-skew tolerance in time calculation", () => {
      const expiresAt = new Date('2023-01-01T09:59:30Z'); // 30 seconds ago
      const clockSkewTolerance = 60000; // 1 minute tolerance
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      // Without clock-skew tolerance, should be 0 (expired)
      expect(token.getTimeToExpiry(0)).toBe(0);
      
      // With clock-skew tolerance, should have remaining time
      const remainingTime = token.getTimeToExpiry(clockSkewTolerance);
      expect(remainingTime).toBeGreaterThan(0);
      expect(remainingTime).toBeLessThanOrEqual(30000); // Should be around 30 seconds
    });
  });

  describe("toPlainObject", () => {
    it("should return serializable object without token string", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      const plainObject = token.toPlainObject();

      expect(plainObject).toEqual({
        id: token.id,
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt: expiresAt,
        usedAt: null,
        createdAt: token.createdAt,
        isValid: true,
        isExpired: false,
        isUsed: false,
        timeToExpiry: 5 * 60 * 1000,
      });

      // Token string should not be included for security
      expect(plainObject).not.toHaveProperty('token');
    });

    it("should be JSON serializable", () => {
      const expiresAt = new Date('2023-01-01T10:05:00Z');
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      const plainObject = token.toPlainObject();
      
      expect(() => JSON.stringify(plainObject)).not.toThrow();
      
      const serialized = JSON.stringify(plainObject);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized.id).toBe(token.id);
      expect(deserialized.isValid).toBe(true);
    });

    it("should handle clock-skew tolerance in plain object", () => {
      const expiresAt = new Date('2023-01-01T09:59:30Z'); // 30 seconds ago
      const clockSkewTolerance = 60000; // 1 minute tolerance
      
      const token = DownloadToken.create({
        documentId: mockDocumentId,
        issuedTo: mockUserId,
        expiresAt,
      });

      // Without clock-skew tolerance
      const plainObjectWithoutTolerance = token.toPlainObject(0);
      expect(plainObjectWithoutTolerance.isValid).toBe(false);
      expect(plainObjectWithoutTolerance.isExpired).toBe(true);
      expect(plainObjectWithoutTolerance.timeToExpiry).toBe(0);

      // With clock-skew tolerance
      const plainObjectWithTolerance = token.toPlainObject(clockSkewTolerance);
      expect(plainObjectWithTolerance.isValid).toBe(true);
      expect(plainObjectWithTolerance.isExpired).toBe(false);
      expect(plainObjectWithTolerance.timeToExpiry).toBeGreaterThan(0);
    });
  });
});
