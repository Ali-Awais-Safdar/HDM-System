import { Effect as E, Option as O, pipe, Clock } from "effect"
import { injectable, inject } from "tsyringe"
import { AccessPolicyEntity, Role, SubjectType } from "@domain/accessPolicy/access-policy.entity"
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import {
  AccessPolicyConflictError,
  AccessPolicyNotFoundError,
  AccessPolicyValidationError,
} from "@domain/accessPolicy/access-policy.error"
import { ValidationError } from "@domain/utils/base.errors"
import { type Paginated, PaginationOptions, defaultPaginationOptions, calculateTotalPages } from "@domain/utils/pagination"
import { AccessPolicyId, DocumentId, UserId } from "@domain/refined/ids"
import { accessPolicies, type AccessPolicyModel } from "@infra/db/models/access-policy.model"
import { AccessPolicyMapper } from "@infra/db/mappers"
import { eq, and, count, type SQL } from "drizzle-orm"
import type { DatabaseInterface } from "@infra/db/interfaces"
import { isUniqueConstraintError, getErrorMessage, translateDbError } from "@infra/db/errors"
import type { InfrastructureErrorType } from "@infra/errors/infrastructure.errors"
import { fetchSingle, fetchMultiple, mapInfraErrorToDomainWithFailFast, executeQuery } from "./helpers"
import { isInfraError } from "app/shared/error-matching"
import { TOKENS } from "@infra/di/container"

/**
 * Drizzle-based Access Policy Repository Implementation
 */
@injectable()
export class AccessPolicyDrizzleRepository extends AccessPolicyRepository {
  constructor(@inject(TOKENS.DATABASE_CONNECTION) private readonly db: DatabaseInterface) { 
    super() 
  }

  // ========== Repository Methods ==========

  /**
   * Wrapper for AccessPolicyMapper.fromDb that converts AccessPolicyValidationError to ValidationError
   */
  private mapPolicyFromDb(row: AccessPolicyModel): E.Effect<AccessPolicyEntity, ValidationError, Clock.Clock> {
    return pipe(
      AccessPolicyMapper.fromDb(row),
      E.mapError((error) => new ValidationError(error.message, error.field, error.value))
    )
  }

  findById(
    id: AccessPolicyId
  ): E.Effect<O.Option<AccessPolicyEntity>, AccessPolicyNotFoundError | ValidationError, Clock.Clock> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(accessPolicies).where(eq(accessPolicies.id, id)).limit(1),
        this.mapPolicyFromDb.bind(this),
        {
          entityType: "AccessPolicy",
          operation: "findById",
          entityId: id
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors (with fail-fast for unexpected)
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("AccessPolicy", (msg, field, value) => new AccessPolicyNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError
        return E.fail(error as ValidationError)
      })
    )
  }

  findByResourceId(
    resourceId: DocumentId
  ): E.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | AccessPolicyValidationError, Clock.Clock> {
    return pipe(
      fetchMultiple(
        () => this.db.select().from(accessPolicies).where(eq(accessPolicies.resourceId, resourceId)),
        this.mapPolicyFromDb.bind(this),
        {
          entityType: "AccessPolicy",
          operation: "findByResourceId"
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("AccessPolicy", (msg, field, value) => new AccessPolicyNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError (which will become AccessPolicyValidationError in mapper)
        return E.fail(error as ValidationError)
      }),
      E.mapError((error): AccessPolicyNotFoundError | AccessPolicyValidationError =>
        error instanceof AccessPolicyValidationError
          ? error
          : error instanceof AccessPolicyNotFoundError
          ? error
          : new AccessPolicyValidationError(error.message, error.field, error.value)
      )
    )
  }

  // ========== Pure Helper Functions ==========

  private buildSubjectConditions(
    subjectType: SubjectType,
    subjectId?: UserId,
    role?: Role
  ): SQL[] {
    return [
      eq(accessPolicies.subjectType, subjectType),
      subjectType === "user" && subjectId ? eq(accessPolicies.subjectId, subjectId) : undefined,
      subjectType === "role" && role ? eq(accessPolicies.role, role) : undefined
    ].filter((condition): condition is SQL => condition !== undefined)
  }

  findBySubject(
    subjectType: SubjectType,
    subjectId?: UserId,
    role?: Role
  ): E.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | AccessPolicyValidationError, Clock.Clock> {
    return pipe(
      fetchMultiple(
        () => {
          const conditions = this.buildSubjectConditions(subjectType, subjectId, role)
          return this.db
            .select()
            .from(accessPolicies)
            .where(and(...conditions))
        },
        this.mapPolicyFromDb.bind(this),
        {
          entityType: "AccessPolicy",
          operation: "findBySubject"
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors (with fail-fast for unexpected)
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("AccessPolicy", (msg, field, value) => new AccessPolicyNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError
        return E.fail(error as ValidationError)
      }),
      E.mapError((error): AccessPolicyNotFoundError | AccessPolicyValidationError =>
        error instanceof AccessPolicyValidationError
          ? error
          : error instanceof AccessPolicyNotFoundError
          ? error
          : new AccessPolicyValidationError(error.message, error.field, error.value)
      )
    )
  }

  findByUserAndResource(
    userId: UserId,
    resourceId: DocumentId
  ): E.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | AccessPolicyValidationError, Clock.Clock> {
    return pipe(
      fetchMultiple(
        () => this.db
          .select()
          .from(accessPolicies)
          .where(
            and(
              eq(accessPolicies.resourceId, resourceId),
              eq(accessPolicies.subjectType, "user"),
              eq(accessPolicies.subjectId, userId)
            )
          ),
        this.mapPolicyFromDb.bind(this),
        {
          entityType: "AccessPolicy",
          operation: "findByUserAndResource"
        }
      ),
      E.catchAll((error) => {
        // Map infrastructure errors to domain errors (with fail-fast for unexpected)
        if (isInfraError(error)) {
          return mapInfraErrorToDomainWithFailFast("AccessPolicy", (msg, field, value) => new AccessPolicyNotFoundError(msg, field, value))(error)
        }
        // Pass through ValidationError
        return E.fail(error as ValidationError)
      }),
      E.mapError((error): AccessPolicyNotFoundError | AccessPolicyValidationError =>
        error instanceof AccessPolicyValidationError
          ? error
          : error instanceof AccessPolicyNotFoundError
          ? error
          : new AccessPolicyValidationError(error.message, error.field, error.value)
      )
    )
  }

  exists(
    id: AccessPolicyId
  ): E.Effect<boolean, InfrastructureErrorType> {
    return pipe(
      executeQuery(
        () => this.db
          .select({ id: accessPolicies.id })
          .from(accessPolicies)
          .where(eq(accessPolicies.id, id))
          .limit(1),
        {
          entityType: "AccessPolicy",
          operation: "exists",
          entityId: id
        }
      ),
      E.map((result) => result.length > 0)
    )
  }

  private ensureExists(id: AccessPolicyId): E.Effect<void, AccessPolicyNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.catchAll((error) => {
        // Map infrastructure errors (unexpected errors will fail fast as defects via mapInfraErrorToDomainWithFailFast)
        if (isInfraError(error)) {
          return pipe(
            mapInfraErrorToDomainWithFailFast("AccessPolicy", (msg, field, value) => new AccessPolicyNotFoundError(msg, field, value))(error),
            E.mapError((err) => err instanceof AccessPolicyNotFoundError ? err : new AccessPolicyNotFoundError(err.message, err.field, err.value))
          )
        }
        // Unknown errors should fail fast
        return E.die(error)
      }),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () => E.succeed(undefined),
          onFalse: () => E.fail(new AccessPolicyNotFoundError(`Access policy not found: id=${id}`, "id", id))
        })
      )
    )
  }

  private mapPolicySaveError(error: unknown, policy: AccessPolicyEntity): AccessPolicyConflictError | AccessPolicyValidationError {
    return error instanceof AccessPolicyConflictError
      ? error
      : error instanceof AccessPolicyValidationError
      ? error
      : error instanceof ValidationError
      ? new AccessPolicyValidationError(error.message, error.field, error.value)
      : new AccessPolicyValidationError(`Failed to save access policy: ${getErrorMessage(error)}`, "policyId", policy.id)
  }

  save(
    policy: AccessPolicyEntity
  ): E.Effect<AccessPolicyEntity, AccessPolicyConflictError | AccessPolicyValidationError, Clock.Clock> {
    return pipe(
      this.findById(policy.id),
      E.flatMap((existingPolicy) =>
        O.match(existingPolicy, {
          onNone: () => this.insert(policy),
          onSome: () => this.update(policy)
        })
      ),
      E.mapError((error) => this.mapPolicySaveError(error, policy))
    )
  }

  private insert(
    policy: AccessPolicyEntity
  ): E.Effect<AccessPolicyEntity, AccessPolicyConflictError | AccessPolicyValidationError | ValidationError, never> {
    return pipe(
      AccessPolicyMapper.toDb(policy),
      E.flatMap((dbData) =>
        pipe(
          E.tryPromise({
            try: () => this.db.insert(accessPolicies).values(dbData),
            catch: (error) => error
          }),
          E.catchAll((error): E.Effect<void, AccessPolicyConflictError | AccessPolicyNotFoundError | ValidationError, never> => {
            // Handle unique constraint violations with domain-specific error
            if (isUniqueConstraintError(error)) {
              return E.fail(new AccessPolicyConflictError(
                `Access policy already exists for resource ${policy.resourceId} and subject ${policy.subjectId}`,
                "resourceId",
                policy.resourceId,
                { subjectId: O.getOrElse(policy.subjectId, () => "unknown") }
              ))
            }
            // Translate infrastructure errors to domain errors
            return pipe(
              translateDbError(error, { operation: "insert", entityType: "AccessPolicy", entityId: policy.id }),
              E.catchAll(mapInfraErrorToDomainWithFailFast("AccessPolicy", (msg, field, value) => new AccessPolicyNotFoundError(msg, field, value)))
            )
          })
        )
      ),
      E.as(policy),
      E.mapError((error): AccessPolicyConflictError | AccessPolicyValidationError | ValidationError => {
        if (error instanceof AccessPolicyConflictError) {
          return error
        }
        if (error instanceof AccessPolicyValidationError) {
          return error
        }
        if (error instanceof AccessPolicyNotFoundError) {
          // Convert AccessPolicyNotFoundError to AccessPolicyValidationError for insert (save expects AccessPolicyValidationError)
          return new AccessPolicyValidationError(error.message, error.field, error.value)
        }
        return error as ValidationError
      })
    )
  }

  private update(
    policy: AccessPolicyEntity
  ): E.Effect<AccessPolicyEntity, AccessPolicyValidationError | ValidationError, never> {
    return pipe(
      this.ensureExists(policy.id),
      E.flatMap(() => AccessPolicyMapper.toDb(policy)),
      E.flatMap((dbData) =>
        pipe(
          E.tryPromise({
            try: () => this.db
              .update(accessPolicies)
              .set(dbData)
              .where(eq(accessPolicies.id, policy.id)),
            catch: (error) => error
          }),
          E.catchAll((error) =>
            pipe(
              translateDbError(error, { operation: "update", entityType: "AccessPolicy", entityId: policy.id }),
              E.catchAll(mapInfraErrorToDomainWithFailFast("AccessPolicy", (msg, field, value) => new AccessPolicyNotFoundError(msg, field, value)))
            )
          )
        )
      ),
      E.as(policy),
      E.mapError((error): AccessPolicyValidationError | ValidationError => {
        if (error instanceof AccessPolicyValidationError) {
          return error
        }
        if (error instanceof AccessPolicyNotFoundError) {
          // Convert NotFoundError to ValidationError for update (save expects ValidationError)
          return new AccessPolicyValidationError(error.message, error.field, error.value)
        }
        return error as ValidationError
      })
    )
  }

  delete(
    id: AccessPolicyId
  ): E.Effect<boolean, AccessPolicyNotFoundError, never> {
    return pipe(
      this.exists(id),
      E.catchAll((error) => {
        // Map infrastructure errors (unexpected errors will fail fast as defects via mapInfraErrorToDomainWithFailFast)
        if (isInfraError(error)) {
          return pipe(
            mapInfraErrorToDomainWithFailFast("AccessPolicy", (msg, field, value) => new AccessPolicyNotFoundError(msg, field, value))(error),
            E.mapError((err) => err instanceof AccessPolicyNotFoundError ? err : new AccessPolicyNotFoundError(err.message, err.field, err.value))
          )
        }
        // Unknown errors should fail fast
        return E.die(error)
      }),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () =>
            pipe(
              E.tryPromise({
                try: () => this.db.delete(accessPolicies).where(eq(accessPolicies.id, id)),
                catch: (error) => error
              }),
              E.catchAll((error) =>
                pipe(
                  translateDbError(error, { operation: "delete", entityType: "AccessPolicy", entityId: id }),
                  E.catchAll(mapInfraErrorToDomainWithFailFast("AccessPolicy", (msg, field, value) => new AccessPolicyNotFoundError(msg, field, value)))
                )
              ),
              E.mapError((error): AccessPolicyNotFoundError => 
                error instanceof AccessPolicyNotFoundError
                  ? error
                  : new AccessPolicyNotFoundError(`Failed to delete access policy: ${error instanceof Error ? error.message : String(error)}`, "id", id)
              ),
              E.as(true)
            ),
          onFalse: () => E.fail(new AccessPolicyNotFoundError(`Access policy not found: id=${id}`, "id", id))
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
          const result = await this.db
            .delete(accessPolicies)
            .where(eq(accessPolicies.resourceId, resourceId))
          
          return result.rowCount ?? 0
        },
        catch: (error) => error
      }),
      E.catchAll((error) =>
        pipe(
          translateDbError(error, { operation: "deleteByResourceId", entityType: "AccessPolicy" }),
          E.catchAll(mapInfraErrorToDomainWithFailFast("AccessPolicy", (msg, field, value) => new AccessPolicyNotFoundError(msg, field, value)))
        )
      ),
      E.mapError((error): AccessPolicyNotFoundError => 
        error instanceof AccessPolicyNotFoundError
          ? error
          : new AccessPolicyNotFoundError(`Failed to delete access policies by resourceId: ${error instanceof Error ? error.message : String(error)}`, "resourceId", resourceId)
      )
    )
  }

  deleteByUserId(
    userId: UserId
  ): E.Effect<number, AccessPolicyNotFoundError, never> {
    return pipe(
      E.tryPromise({
        try: async () => {
          const result = await this.db
            .delete(accessPolicies)
            .where(
              and(
                eq(accessPolicies.subjectType, "user"),
                eq(accessPolicies.subjectId, userId)
              )
            )
          
          return result.rowCount ?? 0
        },
        catch: (error) => error
      }),
      E.catchAll((error) =>
        pipe(
          translateDbError(error, { operation: "deleteByUserId", entityType: "AccessPolicy" }),
          E.catchAll(mapInfraErrorToDomainWithFailFast("AccessPolicy", (msg, field, value) => new AccessPolicyNotFoundError(msg, field, value)))
        )
      ),
      E.mapError((error): AccessPolicyNotFoundError => 
        error instanceof AccessPolicyNotFoundError
          ? error
          : new AccessPolicyNotFoundError(`Failed to delete access policies by userId: ${error instanceof Error ? error.message : String(error)}`, "userId", userId)
      )
    )
  }

  list(options?: PaginationOptions): E.Effect<Paginated<AccessPolicyEntity>, AccessPolicyNotFoundError | ValidationError, Clock.Clock> {
    const paginationOptions = options ?? defaultPaginationOptions()
    const offset = (paginationOptions.pageNum - 1) * paginationOptions.pageSize

    return pipe(
      E.tryPromise({
        try: async () => {
          const [data, totalResult] = await Promise.all([
            this.db
              .select()
              .from(accessPolicies)
              .limit(paginationOptions.pageSize)
              .offset(offset)
              .orderBy(accessPolicies.createdAt),
            this.db
              .select({ count: count() })
              .from(accessPolicies)
          ])

          return { 
            data: data as AccessPolicyModel[], 
            total: Number(totalResult[0]?.count ?? 0)
          }
        },
        catch: (error) => error
      }),
      E.catchAll((error) =>
        pipe(
          translateDbError(error, { operation: "list", entityType: "AccessPolicy" }),
          E.catchAll(mapInfraErrorToDomainWithFailFast("AccessPolicy", (msg, field, value) => new AccessPolicyNotFoundError(msg, field, value)))
        )
      ),
      E.flatMap(({ data, total }) =>
        data.length === 0
          ? E.succeed({
              data: [] as readonly AccessPolicyEntity[],
              total,
              pageNum: paginationOptions.pageNum,
              pageSize: paginationOptions.pageSize,
              totalPages: calculateTotalPages(total, paginationOptions.pageSize)
            } as Paginated<AccessPolicyEntity>)
          : pipe(
              E.forEach(data, (row) => this.mapPolicyFromDb(row)),
              E.map((entities): Paginated<AccessPolicyEntity> => ({
                data: entities,
                total,
                pageNum: paginationOptions.pageNum,
                pageSize: paginationOptions.pageSize,
                totalPages: calculateTotalPages(total, paginationOptions.pageSize)
              }))
            )
      )
    )
  }
}
