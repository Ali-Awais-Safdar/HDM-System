import { UserEntity, SerializedUser } from "../../src/domain/entities/user.entity";
import { Role } from "../../src/domain/schema/access-policy.schema";
import { faker } from "@faker-js/faker";
import { Effect as E } from "effect";
import * as fc from "fast-check";

/**
 * User-specific generators for test data
 */
const userGenerators = {
  id: () => crypto.randomUUID(),
  
  email: () => faker.internet.email().toLowerCase(),

  passwordHash: () => "$2b$10$" + faker.string.alphanumeric(53),

  roles: (): Role[] => {
    const isAdmin = faker.datatype.boolean({ probability: 0.2 });
    return isAdmin ? ["ADMIN" as Role] : ["USER" as Role];
  },

  workspaceId: () => crypto.randomUUID(),

  createdAt: () => faker.date.past({ years: 3 }).toISOString(),
};

/**
 * Base factory function for generating test user data (encoded format with Options)
 */
export const generateTestUser = (overrides: Partial<SerializedUser> = {}): SerializedUser => {
  const shouldHaveWorkspace = faker.datatype.boolean({ probability: 0.3 });

  return {
    id: userGenerators.id(),
    email: userGenerators.email(),
    passwordHash: userGenerators.passwordHash(),
    roles: userGenerators.roles(),
    workspaceId: shouldHaveWorkspace 
      ? { _tag: "Some" as const, value: userGenerators.workspaceId() }
      : { _tag: "None" as const },
    createdAt: userGenerators.createdAt(),
    ...overrides,
  };
};

/**
 * Generate multiple test users
 */
export const generateTestUsers = (count: number): SerializedUser[] => {
  return Array.from({ length: count }, () => generateTestUser());
};

/**
 * Scenario: Admin user
 */
export const createAdminUser = (overrides: Partial<SerializedUser> = {}): SerializedUser => {
  return {
    ...generateTestUser(),
    roles: ["ADMIN" as Role],
    ...overrides,
  };
};

/**
 * Scenario: Regular user
 */
export const createRegularUser = (overrides: Partial<SerializedUser> = {}): SerializedUser => {
  return {
    ...generateTestUser(),
    roles: ["USER" as Role],
    ...overrides,
  };
};

/**
 * Scenario: User with workspace assignment
 */
export const createUserWithWorkspace = (
  workspaceId: string,
  overrides: Partial<SerializedUser> = {}
): SerializedUser => {
  return {
    ...generateTestUser(),
    workspaceId: { _tag: "Some" as const, value: workspaceId },
    ...overrides,
  };
};

/**
 * Scenario: User without workspace
 */
export const createUserWithoutWorkspace = (overrides: Partial<SerializedUser> = {}): SerializedUser => {
  return {
    ...generateTestUser(),
    workspaceId: { _tag: "None" as const },
    ...overrides,
  };
};

/**
 * Create a test User entity from generated data
 */
export const createTestUserEntity = (
  overrides: Partial<SerializedUser> = {}
): E.Effect<UserEntity, Error> => {
  const userData = generateTestUser(overrides);

  return UserEntity.create(userData).pipe(
    E.mapError((error) => new Error(`Failed to create test user entity: ${error.message}`))
  ) as E.Effect<UserEntity, Error>;
};

/**
 * Create multiple test User entities
 */
export const createTestUserEntities = (
  count: number,
  overrides: Partial<SerializedUser> = {}
): E.Effect<UserEntity[], Error> => {
  const users = generateTestUsers(count).map((user) => ({ ...user, ...overrides }));

  return E.all(users.map((data) => UserEntity.create(data))).pipe(
    E.mapError((error) => new Error(`Failed to create test user entities: ${error}`))
  ) as E.Effect<UserEntity[], Error>;
};

/**
 * Fast-check arbitrary for property-based testing
 */
export const userArbitrary = fc.record({
  id: fc.uuid(),
  email: fc.emailAddress(),
  passwordHash: fc.string({ minLength: 60, maxLength: 60 }),
  roles: fc.constantFrom(
    ["ADMIN" as Role],
    ["USER" as Role]
  ),
  workspaceId: fc.oneof(
    fc.constant({ _tag: "None" as const }),
    fc.uuid().map(id => ({ _tag: "Some" as const, value: id }))
  ),
  createdAt: fc.date().map(d => d.toISOString()),
});
