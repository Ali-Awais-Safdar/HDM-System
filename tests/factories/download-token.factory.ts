import { DownloadTokenEntity, SerializedDownloadToken } from "../../src/domain/entities/download-token.entity";
import { faker } from "@faker-js/faker";
import { Effect as E } from "effect";
import * as fc from "fast-check";
import { randomBytes } from "crypto";

/**
 * DownloadToken-specific generators for test data
 */
const downloadTokenGenerators = {
  id: () => crypto.randomUUID(),

  token: () => {
    return randomBytes(32)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  },

  documentId: () => crypto.randomUUID(),
  issuedTo: () => crypto.randomUUID(),

  expiresAt: (minutesFromNow: number = 5) => {
    const now = new Date();
    return new Date(now.getTime() + minutesFromNow * 60 * 1000).toISOString();
  },

  usedAt: () => faker.date.recent().toISOString(),
  createdAt: () => faker.date.recent().toISOString(),
};

/**
 * Base factory function for generating test download token data (encoded format with Options)
 */
export const generateTestDownloadToken = (
  overrides: Partial<SerializedDownloadToken> = {}
): SerializedDownloadToken => {
  const shouldBeUsed = faker.datatype.boolean({ probability: 0.3 });

  return {
    id: downloadTokenGenerators.id(),
    token: downloadTokenGenerators.token(),
    documentId: downloadTokenGenerators.documentId(),
    issuedTo: downloadTokenGenerators.issuedTo(),
    expiresAt: downloadTokenGenerators.expiresAt(5),
    usedAt: shouldBeUsed 
      ? { _tag: "Some" as const, value: downloadTokenGenerators.usedAt() }
      : { _tag: "None" as const },
    createdAt: downloadTokenGenerators.createdAt(),
    ...overrides,
  };
};

/**
 * Generate multiple test download tokens
 */
export const generateTestDownloadTokens = (count: number): SerializedDownloadToken[] => {
  return Array.from({ length: count }, () => generateTestDownloadToken());
};

/**
 * Scenario: Unused token (valid and not used)
 */
export const createUnusedToken = (overrides: Partial<SerializedDownloadToken> = {}): SerializedDownloadToken => {
  return {
    ...generateTestDownloadToken(),
    usedAt: { _tag: "None" as const },
    expiresAt: downloadTokenGenerators.expiresAt(30),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
};

/**
 * Scenario: Used token
 */
export const createUsedToken = (overrides: Partial<SerializedDownloadToken> = {}): SerializedDownloadToken => {
  const createdAt = faker.date.past({ years: 1 });
  const usedAt = new Date(createdAt.getTime() + 2 * 60 * 1000);

  return {
    ...generateTestDownloadToken(),
    createdAt: createdAt.toISOString(),
    usedAt: { _tag: "Some" as const, value: usedAt.toISOString() },
    expiresAt: new Date(createdAt.getTime() + 5 * 60 * 1000).toISOString(),
    ...overrides,
  };
};

/**
 * Scenario: Expired token
 */
export const createExpiredToken = (overrides: Partial<SerializedDownloadToken> = {}): SerializedDownloadToken => {
  const createdAt = faker.date.past({ years: 1 });
  const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000);

  return {
    ...generateTestDownloadToken(),
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    usedAt: { _tag: "None" as const },
    ...overrides,
  };
};

/**
 * Scenario: Token expiring soon (< 1 minute remaining)
 */
export const createExpiringSoonToken = (overrides: Partial<SerializedDownloadToken> = {}): SerializedDownloadToken => {
  return {
    ...generateTestDownloadToken(),
    usedAt: { _tag: "None" as const },
    expiresAt: new Date(Date.now() + 30 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 4.5 * 60 * 1000).toISOString(),
    ...overrides,
  };
};

/**
 * Scenario: Token with long expiry (1 hour)
 */
export const createLongExpiryToken = (overrides: Partial<SerializedDownloadToken> = {}): SerializedDownloadToken => {
  return {
    ...generateTestDownloadToken(),
    usedAt: { _tag: "None" as const },
    expiresAt: downloadTokenGenerators.expiresAt(60),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
};

/**
 * Scenario: Token for specific user and document
 */
export const createTokenForUserAndDocument = (
  issuedTo: string,
  documentId: string,
  overrides: Partial<SerializedDownloadToken> = {}
): SerializedDownloadToken => {
  return {
    ...generateTestDownloadToken(),
    issuedTo,
    documentId,
    usedAt: { _tag: "None" as const },
    expiresAt: downloadTokenGenerators.expiresAt(5),
    ...overrides,
  };
};

/**
 * Create a test DownloadToken entity from generated data
 */
export const createTestDownloadTokenEntity = (
  overrides: Partial<SerializedDownloadToken> = {}
): E.Effect<DownloadTokenEntity, Error> => {
  const tokenData = generateTestDownloadToken(overrides);

  return DownloadTokenEntity.create(tokenData).pipe(
    E.mapError((error) => new Error(`Failed to create test download token entity: ${error.message}`))
  ) as E.Effect<DownloadTokenEntity, Error>;
};

/**
 * Create multiple test DownloadToken entities
 */
export const createTestDownloadTokenEntities = (
  count: number,
  overrides: Partial<SerializedDownloadToken> = {}
): E.Effect<DownloadTokenEntity[], Error> => {
  const tokens = generateTestDownloadTokens(count).map((token) => ({ ...token, ...overrides }));

  return E.all(tokens.map((data) => DownloadTokenEntity.create(data))).pipe(
    E.mapError((error) => new Error(`Failed to create test download token entities: ${error}`))
  ) as E.Effect<DownloadTokenEntity[], Error>;
};

/**
 * Fast-check arbitrary for property-based testing
 */
export const downloadTokenArbitrary = fc.record({
  id: fc.uuid(),
  token: fc.string({ minLength: 32 }),
  documentId: fc.uuid(),
  issuedTo: fc.uuid(),
  expiresAt: fc.date({ min: new Date() }).map(d => d.toISOString()),
  usedAt: fc.oneof(
    fc.constant({ _tag: "None" as const }),
    fc.date().map(d => ({ _tag: "Some" as const, value: d.toISOString() }))
  ),
  createdAt: fc.date().map(d => d.toISOString()),
});
