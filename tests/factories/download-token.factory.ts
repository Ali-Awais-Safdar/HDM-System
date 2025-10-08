import { DownloadTokenEntity, SerializedDownloadToken } from "../../src/app/domain/downloadToken/download-token.entity";
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

export const generateTestDownloadTokens = (count: number): SerializedDownloadToken[] => {
  return Array.from({ length: count }, () => generateTestDownloadToken());
};

export const createUnusedToken = (overrides: Partial<SerializedDownloadToken> = {}): SerializedDownloadToken => {
  return {
    ...generateTestDownloadToken(),
    usedAt: { _tag: "None" as const },
    expiresAt: downloadTokenGenerators.expiresAt(30),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
};

export const createUsedToken = (overrides: Partial<SerializedDownloadToken> = {}): SerializedDownloadToken => {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 3 * 60 * 1000); // 3 minutes ago
  const usedAt = new Date(createdAt.getTime() + 2 * 60 * 1000); // 2 minutes after creation
  const expiresAt = new Date(now.getTime() + 2 * 60 * 1000); // Still valid, expires in 2 minutes

  return {
    ...generateTestDownloadToken(),
    createdAt: createdAt.toISOString(),
    usedAt: { _tag: "Some" as const, value: usedAt.toISOString() },
    expiresAt: expiresAt.toISOString(), // Future date to pass validation
    ...overrides,
  };
};

export const createExpiredToken = (overrides: Partial<SerializedDownloadToken> = {}): SerializedDownloadToken => {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago
  const expiresAt = overrides.expiresAt || new Date(now.getTime() - 5 * 60 * 1000).toISOString(); // 5 minutes ago (already expired)

  return {
    ...generateTestDownloadToken(),
    createdAt: createdAt.toISOString(),
    expiresAt,
    usedAt: { _tag: "None" as const },
    ...overrides,
  };
};

export const createExpiringSoonToken = (overrides: Partial<SerializedDownloadToken> = {}): SerializedDownloadToken => {
  return {
    ...generateTestDownloadToken(),
    usedAt: { _tag: "None" as const },
    expiresAt: new Date(Date.now() + 30 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 4.5 * 60 * 1000).toISOString(),
    ...overrides,
  };
};

export const createLongExpiryToken = (overrides: Partial<SerializedDownloadToken> = {}): SerializedDownloadToken => {
  return {
    ...generateTestDownloadToken(),
    usedAt: { _tag: "None" as const },
    expiresAt: downloadTokenGenerators.expiresAt(60),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
};

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

export const createTestDownloadTokenEntity = (
  overrides: Partial<SerializedDownloadToken> = {},
  useUnsafe: boolean = false
): E.Effect<DownloadTokenEntity, Error> => {
  const tokenData = generateTestDownloadToken(overrides);

  if (useUnsafe) {
    const entity = DownloadTokenEntity.unsafe(tokenData);
    return E.succeed(entity);
  }

  return DownloadTokenEntity.create(tokenData).pipe(
    E.mapError((error) => new Error(`Failed to create test download token entity: ${error.message}`))
  ) as E.Effect<DownloadTokenEntity, Error>;
};

export const createTestDownloadTokenEntities = (
  count: number,
  overrides: Partial<SerializedDownloadToken> = {}
): E.Effect<DownloadTokenEntity[], Error> => {
  const tokens = generateTestDownloadTokens(count).map((token) => ({ ...token, ...overrides }));

  return E.all(tokens.map((data) => DownloadTokenEntity.create(data))).pipe(
    E.mapError((error) => new Error(`Failed to create test download token entities: ${error}`))
  ) as E.Effect<DownloadTokenEntity[], Error>;
};

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
