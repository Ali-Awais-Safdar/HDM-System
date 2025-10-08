import { Effect as E, Option as O, pipe } from "effect"
import { AccessPolicyEntity, Role, SubjectType } from "@domain/accessPolicy/access-policy.entity"
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import {
  AccessPolicyConflictError,
  AccessPolicyNotFoundError,
  AccessPolicyValidationError,
} from "@domain/accessPolicy/access-policy.errors"
import { ValidationError } from "@domain/utils/domain.errors"
import { DocumentId, UserId } from "@domain/value-objects/id.vo"
import { accessPolicies, type AccessPolicyModel } from "@infra/services/db/models/access-policy.model"
import { eq, and } from "drizzle-orm"
import type { DatabaseInterface } from "@infra/services/db/interfaces"

/**
 * Drizzle-based Access Policy Repository Implementation
 */
export class AccessPolicyDrizzleRepository extends AccessPolicyRepository {
  constructor(private readonly db: DatabaseInterface) { 
    super() 
  }

  // ========== Serialization Helpers ==========

  private toDbSerialized(policy: AccessPolicyEntity): E.Effect<Omit<AccessPolicyModel, 'updatedAt'>, ValidationError, never> {
    return pipe(
      policy.serialized(),
      E.map((serialized) => ({
        id: serialized.id,
        resourceType: serialized.resourceType,
        resourceId: serialized.resourceId,
        subjectType: serialized.subjectType,
        subjectId: serialized.subjectId ?? null,
        role: serialized.role ?? null,
        actions: serialized.actions as string[],
        effect: serialized.effect,
        createdAt: new Date(serialized.createdAt)
      })),
      E.mapError((error) => new ValidationError(
        `Failed to serialize access policy: ${error}`,
        undefined,
        { policyId: policy.id }
      ))
    )
  }

  private fromDbRow(row: AccessPolicyModel): E.Effect<AccessPolicyEntity, ValidationError, never> {
    return AccessPolicyEntity.fromPersistence({
      id: row.id,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      subjectType: row.subjectType,
      subjectId: row.subjectId ?? undefined,
      role: row.role ?? undefined,
      actions: row.actions,
      effect: row.effect,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt
    })
  }

  // ========== Query Helpers ==========

  private executeQuery<T>(query: () => Promise<T>): E.Effect<T, AccessPolicyNotFoundError> {
    return E.tryPromise({
      try: query,
      catch: (error) => new AccessPolicyNotFoundError(
        "unknown",
        { originalError: error instanceof Error ? error.message : String(error) }
      )
    })
  }

  private fetchSingle(
    query: () => Promise<AccessPolicyModel[]>
  ): E.Effect<O.Option<AccessPolicyEntity>, AccessPolicyNotFoundError | ValidationError, never> {
    return pipe(
      this.executeQuery(query),
      E.map(O.fromIterable),
      E.flatMap((option) =>
        O.match(option, {
          onNone: () => E.succeed(O.none()),
          onSome: (row) => pipe(
            this.fromDbRow(row),
            E.map(O.some)
          )
        })
      )
    )
  }

  private fetchMultiple(
    query: () => Promise<AccessPolicyModel[]>
  ): E.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | ValidationError, never> {
    return pipe(
      this.executeQuery(query),
      E.flatMap((results) => 
        E.all(results.map((row) => this.fromDbRow(row)))
      )
    )
  }

  // ========== Repository Methods ==========

  findById(
    id: string
  ): E.Effect<O.Option<AccessPolicyEntity>, AccessPolicyNotFoundError | ValidationError, never> {
    return this.fetchSingle(() =>
      this.db.select().from(accessPolicies).where(eq(accessPolicies.id, id)).limit(1)
    )
  }

  findByResourceId(
    resourceId: DocumentId
  ): E.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | ValidationError, never> {
    return this.fetchMultiple(() =>
      this.db.select().from(accessPolicies).where(eq(accessPolicies.resourceId, resourceId))
    )
  }

  findBySubject(
    subjectType: SubjectType,
    subjectId?: UserId,
    role?: Role
  ): E.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | ValidationError, never> {
    return this.fetchMultiple(() => {
      const conditions = [eq(accessPolicies.subjectType, subjectType)]
      
      if (subjectType === "user" && subjectId) {
        conditions.push(eq(accessPolicies.subjectId, subjectId))
      }
      
      if (subjectType === "role" && role) {
        conditions.push(eq(accessPolicies.role, role))
      }

      return this.db
        .select()
        .from(accessPolicies)
        .where(and(...conditions))
    })
  }

  findByUserAndResource(
    userId: UserId,
    resourceId: DocumentId
  ): E.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | ValidationError, never> {
    return this.fetchMultiple(() =>
      this.db
        .select()
        .from(accessPolicies)
        .where(
          and(
            eq(accessPolicies.resourceId, resourceId),
            eq(accessPolicies.subjectType, "user"),
            eq(accessPolicies.subjectId, userId)
          )
        )
    )
  }

  exists(
    id: string
  ): E.Effect<boolean, AccessPolicyNotFoundError, never> {
    return pipe(
      E.tryPromise({
        try: (): Promise<Pick<AccessPolicyModel, "id">[]> =>
          this.db
            .select({ id: accessPolicies.id })
            .from(accessPolicies)
            .where(eq(accessPolicies.id, id))
            .limit(1),
        catch: () => new AccessPolicyNotFoundError(id)
      }),
      E.map((result) => result.length > 0)
    )
  }

  private ensureExists(id: string): E.Effect<void, AccessPolicyNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () => E.succeed(undefined),
          onFalse: () => E.fail(new AccessPolicyNotFoundError(id))
        })
      )
    )
  }

  save(
    policy: AccessPolicyEntity
  ): E.Effect<AccessPolicyEntity, AccessPolicyConflictError | AccessPolicyValidationError | ValidationError, never> {
    return pipe(
      // Check if policy already exists
      this.findById(policy.id),
      E.flatMap((existingPolicy) =>
        O.match(existingPolicy, {
          onNone: () => this.insert(policy),
          onSome: () => this.update(policy) as E.Effect<AccessPolicyEntity, AccessPolicyConflictError | ValidationError, never>
        })
      ),
      E.mapError((error): AccessPolicyConflictError | AccessPolicyValidationError => {
        if (error instanceof ValidationError) {
          return new AccessPolicyValidationError(
            error.message,
            error.field,
            error.value
          )
        }
        if (error instanceof AccessPolicyConflictError) {
          return error
        }
        return new AccessPolicyValidationError(
          `Failed to save access policy: ${error}`,
          undefined,
          { policyId: policy.id }
        )
      })
    )
  }

  private insert(
    policy: AccessPolicyEntity
  ): E.Effect<AccessPolicyEntity, AccessPolicyConflictError | ValidationError, never> {
    return pipe(
      this.toDbSerialized(policy),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.insert(accessPolicies).values(dbData),
          catch: (error) => {
            const errorMsg = error instanceof Error ? error.message : String(error)
            if (errorMsg.includes('unique') || errorMsg.includes('duplicate')) {
              return new AccessPolicyConflictError(
                `Access policy already exists for resource ${policy.resourceId} and subject ${policy.subjectId}`,
                policy.resourceId,
                policy.subjectId ?? "unknown"
              )
            }
            return new ValidationError(
              `Failed to insert access policy: ${errorMsg}`,
              undefined,
              { policyId: policy.id }
            )
          }
        })
      ),
      E.as(policy)
    )
  }

  private update(
    policy: AccessPolicyEntity
  ): E.Effect<AccessPolicyEntity, ValidationError | AccessPolicyNotFoundError, never> {
    return pipe(
      this.ensureExists(policy.id),
      E.flatMap(() => this.toDbSerialized(policy)),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db
            .update(accessPolicies)
            .set(dbData)
            .where(eq(accessPolicies.id, policy.id)),
          catch: (error) => new ValidationError(
            `Failed to update access policy: ${error instanceof Error ? error.message : String(error)}`,
            undefined,
            { policyId: policy.id }
          )
        })
      ),
      E.as(policy)
    )
  }

  delete(
    id: string
  ): E.Effect<boolean, AccessPolicyNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () =>
            pipe(
              E.tryPromise({
                try: () => this.db.delete(accessPolicies).where(eq(accessPolicies.id, id)),
                catch: () => new AccessPolicyNotFoundError(id)
              }),
              E.as(true)
            ),
          onFalse: () => E.succeed(false)
        })
      )
    )
  }

  deleteByResourceId(
    resourceId: DocumentId
  ): E.Effect<number, AccessPolicyNotFoundError, never> {
    return pipe(
      E.tryPromise({
        try: async () => {
          // First, count how many policies exist for this resource
          const policiesToDelete = await this.db
            .select({ id: accessPolicies.id })
            .from(accessPolicies)
            .where(eq(accessPolicies.resourceId, resourceId))
          
          const count = policiesToDelete.length
          
          // Then delete them if any exist
          if (count > 0) {
            await this.db
              .delete(accessPolicies)
              .where(eq(accessPolicies.resourceId, resourceId))
          }
          
          return count
        },
        catch: (error) => new AccessPolicyNotFoundError(
          "unknown",
          { 
            resourceId,
            originalError: error instanceof Error ? error.message : String(error) 
          }
        )
      })
    )
  }

  deleteByUserId(
    userId: UserId
  ): E.Effect<number, AccessPolicyNotFoundError, never> {
    return pipe(
      E.tryPromise({
        try: async () => {
          // First, count how many policies exist for this user
          const policiesToDelete = await this.db
            .select({ id: accessPolicies.id })
            .from(accessPolicies)
            .where(
              and(
                eq(accessPolicies.subjectType, "user"),
                eq(accessPolicies.subjectId, userId)
              )
            )
          
          const count = policiesToDelete.length
          
          // Then delete them if any exist
          if (count > 0) {
            await this.db
              .delete(accessPolicies)
              .where(
                and(
                  eq(accessPolicies.subjectType, "user"),
                  eq(accessPolicies.subjectId, userId)
                )
              )
          }
          
          return count
        },
        catch: (error) => new AccessPolicyNotFoundError(
          "unknown",
          { 
            userId,
            originalError: error instanceof Error ? error.message : String(error) 
          }
        )
      })
    )
  }
}
