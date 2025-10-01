import { AccessPolicyEntity, SerializedAccessPolicy } from "../../src/domain/entities/access-policy.entity";
import { PermissionAction, Role, SubjectType, PermissionLevel } from "../../src/domain/schema/access-policy.schema";
import { faker } from "@faker-js/faker";
import { Effect as E } from "effect";
import * as fc from "fast-check";

/**
 * AccessPolicy-specific generators for test data
 */
const accessPolicyGenerators = {
  id: () => crypto.randomUUID(),
  resourceId: () => crypto.randomUUID(),
  subjectId: () => crypto.randomUUID(),

  actions: {
    read: () => ["read" as PermissionAction],
    write: () => ["read" as PermissionAction, "update" as PermissionAction, "download" as PermissionAction],
    admin: () => [
      "read" as PermissionAction,
      "update" as PermissionAction,
      "delete" as PermissionAction,
      "download" as PermissionAction,
      "share" as PermissionAction,
    ],
    random: () => {
      const allActions: PermissionAction[] = ["read", "update", "delete", "download", "share"];
      const count = faker.number.int({ min: 1, max: allActions.length });
      return faker.helpers.arrayElements(allActions, count);
    },
  },

  subjectType: (): SubjectType => faker.helpers.arrayElement(["user", "role"] as SubjectType[]),
  role: (): Role => faker.helpers.arrayElement(["ADMIN", "USER"] as Role[]),
  createdAt: () => faker.date.past({ years: 1 }).toISOString(),
};

/**
 * Base factory function for generating test access policy data (encoded format)
 */
export const generateTestAccessPolicy = (
  overrides: Partial<SerializedAccessPolicy> = {}
): SerializedAccessPolicy => {
  const subjectType = overrides.subjectType ?? accessPolicyGenerators.subjectType();
  
  // Build base policy with subject-specific constraints
  const basePolicy: SerializedAccessPolicy = subjectType === "user" 
    ? {
        id: accessPolicyGenerators.id(),
        resourceType: "document" as const,
        resourceId: accessPolicyGenerators.resourceId(),
        subjectType: "user" as const,
        subjectId: accessPolicyGenerators.subjectId(),
        role: undefined,
        actions: accessPolicyGenerators.actions.random(),
        effect: "allow" as const,
        createdAt: accessPolicyGenerators.createdAt(),
      }
    : {
        id: accessPolicyGenerators.id(),
        resourceType: "document" as const,
        resourceId: accessPolicyGenerators.resourceId(),
        subjectType: "role" as const,
        subjectId: undefined,
        role: accessPolicyGenerators.role(),
        actions: accessPolicyGenerators.actions.random(),
        effect: "allow" as const,
        createdAt: accessPolicyGenerators.createdAt(),
      };

  return {
    ...basePolicy,
    ...overrides,
  };
};

/**
 * Generate multiple test access policies
 */
export const generateTestAccessPolicies = (count: number): SerializedAccessPolicy[] => {
  return Array.from({ length: count }, () => generateTestAccessPolicy());
};

/**
 * Scenario: User-specific read policy
 */
export const createUserReadPolicy = (
  subjectId: string,
  resourceId: string,
  overrides: Partial<SerializedAccessPolicy> = {}
): SerializedAccessPolicy => {
  return {
    ...generateTestAccessPolicy(),
    subjectType: "user",
    subjectId,
    resourceId,
    actions: accessPolicyGenerators.actions.read(),
    role: undefined,
    ...overrides,
  };
};

/**
 * Scenario: User-specific write policy
 */
export const createUserWritePolicy = (
  subjectId: string,
  resourceId: string,
  overrides: Partial<SerializedAccessPolicy> = {}
): SerializedAccessPolicy => {
  return {
    ...generateTestAccessPolicy(),
    subjectType: "user",
    subjectId,
    resourceId,
    actions: accessPolicyGenerators.actions.write(),
    role: undefined,
    ...overrides,
  };
};

/**
 * Scenario: User-specific admin policy
 */
export const createUserAdminPolicy = (
  subjectId: string,
  resourceId: string,
  overrides: Partial<SerializedAccessPolicy> = {}
): SerializedAccessPolicy => {
  return {
    ...generateTestAccessPolicy(),
    subjectType: "user",
    subjectId,
    resourceId,
    actions: accessPolicyGenerators.actions.admin(),
    role: undefined,
    ...overrides,
  };
};

/**
 * Scenario: Role-based policy
 */
export const createRolePolicy = (
  role: Role,
  resourceId: string,
  permissionLevel: PermissionLevel = "read",
  overrides: Partial<SerializedAccessPolicy> = {}
): SerializedAccessPolicy => {
  const actionsMap = {
    read: accessPolicyGenerators.actions.read(),
    write: accessPolicyGenerators.actions.write(),
    admin: accessPolicyGenerators.actions.admin(),
  };

  return {
    ...generateTestAccessPolicy(),
    subjectType: "role",
    role,
    resourceId,
    actions: actionsMap[permissionLevel],
    subjectId: undefined,
    ...overrides,
  };
};

/**
 * Scenario: Policy from permission level
 */
export const createPolicyFromLevel = (
  subjectId: string,
  resourceId: string,
  level: PermissionLevel,
  overrides: Partial<SerializedAccessPolicy> = {}
): SerializedAccessPolicy => {
  const actionsMap = {
    read: accessPolicyGenerators.actions.read(),
    write: accessPolicyGenerators.actions.write(),
    admin: accessPolicyGenerators.actions.admin(),
  };

  return {
    ...generateTestAccessPolicy(),
    subjectType: "user",
    subjectId,
    resourceId,
    actions: actionsMap[level],
    role: undefined,
    ...overrides,
  };
};

/**
 * Create a test AccessPolicy entity from generated data
 */
export const createTestAccessPolicyEntity = (
  overrides: Partial<SerializedAccessPolicy> = {}
): E.Effect<AccessPolicyEntity, Error> => {
  const policyData = generateTestAccessPolicy(overrides);

  return AccessPolicyEntity.create(policyData).pipe(
    E.mapError((error) => new Error(`Failed to create test access policy entity: ${error.message}`))
  ) as E.Effect<AccessPolicyEntity, Error>;
};

/**
 * Create multiple test AccessPolicy entities
 */
export const createTestAccessPolicyEntities = (
  count: number,
  overrides: Partial<SerializedAccessPolicy> = {}
): E.Effect<AccessPolicyEntity[], Error> => {
  const policies = generateTestAccessPolicies(count).map((policy) => ({ ...policy, ...overrides }));

  return E.all(policies.map((data) => AccessPolicyEntity.create(data))).pipe(
    E.mapError((error) => new Error(`Failed to create test access policy entities: ${error}`))
  ) as E.Effect<AccessPolicyEntity[], Error>;
};

/**
 * Fast-check arbitrary for property-based testing
 */
export const accessPolicyArbitrary = fc.record({
  id: fc.uuid(),
  resourceType: fc.constant("document" as const),
  resourceId: fc.uuid(),
  subjectType: fc.constantFrom("user" as const, "role" as const),
  subjectId: fc.option(fc.uuid(), { nil: undefined }),
  role: fc.option(fc.constantFrom("ADMIN" as Role, "USER" as Role), { nil: undefined }),
  actions: fc.array(
    fc.constantFrom(
      "read" as PermissionAction,
      "update" as PermissionAction,
      "delete" as PermissionAction,
      "download" as PermissionAction,
      "share" as PermissionAction
    ),
    { minLength: 1, maxLength: 5 }
  ),
  effect: fc.constant("allow" as const),
  createdAt: fc.date().map(d => d.toISOString()),
});
