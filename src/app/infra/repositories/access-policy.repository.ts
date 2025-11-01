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
import { isUniqueConstraintError, getErrorMessage, translateDbError, translateQueryError } from "@infra/db/errors"
import { DatabaseError } from "@domain/utils/base.errors"
import { fetchSingle, fetchMultiple } from "./helpers"
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

  findById(
    id: AccessPolicyId
  ): E.Effect<O.Option<AccessPolicyEntity>, AccessPolicyNotFoundError | ValidationError | DatabaseError, Clock.Clock> {
    return pipe(
      fetchSingle(
        () => this.db.select().from(accessPolicies).where(eq(accessPolicies.id, id)).limit(1),
        AccessPolicyMapper.fromDb,
        "AccessPolicy",
        AccessPolicyNotFoundError
      ),
      E.mapError((error): AccessPolicyNotFoundError | ValidationError | DatabaseError =>
        error instanceof AccessPolicyValidationError
          ? new ValidationError(error.message, error.field, error.value)
          : error
      )
    )
  }

  findByResourceId(
    resourceId: DocumentId
  ): E.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | AccessPolicyValidationError | DatabaseError, Clock.Clock> {
    return fetchMultiple(
      () => this.db.select().from(accessPolicies).where(eq(accessPolicies.resourceId, resourceId)),
      AccessPolicyMapper.fromDb,
      "AccessPolicy",
      AccessPolicyNotFoundError
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
  ): E.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | AccessPolicyValidationError | DatabaseError, Clock.Clock> {
    return fetchMultiple(
      () => {
        const conditions = this.buildSubjectConditions(subjectType, subjectId, role)
        return this.db
          .select()
          .from(accessPolicies)
          .where(and(...conditions))
      },
      AccessPolicyMapper.fromDb,
      "AccessPolicy",
      AccessPolicyNotFoundError
    )
  }

  findByUserAndResource(
    userId: UserId,
    resourceId: DocumentId
  ): E.Effect<readonly AccessPolicyEntity[], AccessPolicyNotFoundError | AccessPolicyValidationError | DatabaseError, Clock.Clock> {
    return fetchMultiple(
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
      AccessPolicyMapper.fromDb,
      "AccessPolicy",
      AccessPolicyNotFoundError
    )
  }

  exists(
    id: AccessPolicyId
  ): E.Effect<boolean, DatabaseError, never> {
    return pipe(
      E.tryPromise({
        try: (): Promise<Pick<AccessPolicyModel, "id">[]> =>
          this.db
            .select({ id: accessPolicies.id })
            .from(accessPolicies)
            .where(eq(accessPolicies.id, id))
            .limit(1),
        catch: (error) => new DatabaseError(
          `Database error during exists check on AccessPolicy`,
          { originalError: error }
        )
      }),
      E.map((result) => result.length > 0)
    )
  }

  private ensureExists(id: AccessPolicyId): E.Effect<void, AccessPolicyNotFoundError | DatabaseError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () => E.succeed(undefined),
          onFalse: () => E.fail(new AccessPolicyNotFoundError(`Access policy not found: id=${id}`, "id", id))
        })
      )
    )
  }

  private mapPolicySaveError(error: unknown, policy: AccessPolicyEntity): AccessPolicyConflictError | AccessPolicyValidationError | DatabaseError {
    return error instanceof DatabaseError
      ? error
      : error instanceof AccessPolicyConflictError || error instanceof AccessPolicyValidationError
      ? error
      : error instanceof ValidationError
      ? new AccessPolicyValidationError(error.message, error.field, error.value)
      : new AccessPolicyValidationError(`Failed to save access policy: ${getErrorMessage(error)}`, "policyId", policy.id)
  }

  save(
    policy: AccessPolicyEntity
  ): E.Effect<AccessPolicyEntity, AccessPolicyConflictError | AccessPolicyValidationError | DatabaseError, Clock.Clock> {
    return pipe(
      this.findById(policy.id),
      E.flatMap((existingPolicy) =>
        O.match(existingPolicy, {
          onNone: () => this.insert(policy),
          onSome: () => this.update(policy) as E.Effect<AccessPolicyEntity, AccessPolicyConflictError | AccessPolicyValidationError | DatabaseError, never>
        })
      ),
      E.mapError((error) => this.mapPolicySaveError(error, policy))
    )
  }

  private insert(
    policy: AccessPolicyEntity
  ): E.Effect<AccessPolicyEntity, AccessPolicyConflictError | AccessPolicyValidationError | ValidationError | DatabaseError, never> {
    return pipe(
      AccessPolicyMapper.toDb(policy),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db.insert(accessPolicies).values(dbData),
          catch: (error) =>
            isUniqueConstraintError(error)
              ? new AccessPolicyConflictError(
                  `Access policy already exists for resource ${policy.resourceId} and subject ${policy.subjectId}`,
                  "resourceId",
                  policy.resourceId,
                  { subjectId: O.getOrElse(policy.subjectId, () => "unknown") }
                )
              : translateDbError(
                  error,
                  { operation: "insert", entityType: "AccessPolicy" },
                  {
                    createConflictError: (message: string) => new AccessPolicyValidationError(message, "policyId", policy.id),
                    createNotFoundError: (field: string, value: string) => new AccessPolicyValidationError(`Access policy not found: ${field}=${value}`, field, value),
                    createValidationError: (message: string, field: string) => new AccessPolicyValidationError(message, field, policy.id)
                  }
                )
        })
      ),
      E.as(policy)
    )
  }

  private update(
    policy: AccessPolicyEntity
  ): E.Effect<AccessPolicyEntity, AccessPolicyValidationError | AccessPolicyNotFoundError | ValidationError | DatabaseError, never> {
    return pipe(
      this.ensureExists(policy.id),
      E.flatMap(() => AccessPolicyMapper.toDb(policy)),
      E.flatMap((dbData) =>
        E.tryPromise({
          try: () => this.db
            .update(accessPolicies)
            .set(dbData)
            .where(eq(accessPolicies.id, policy.id)),
          catch: (error) => translateDbError(
            error,
            { operation: "update", entityType: "AccessPolicy" },
            {
              createConflictError: (message: string) => new AccessPolicyValidationError(message, "policyId", policy.id),
              createNotFoundError: (field: string, value: string) => new AccessPolicyValidationError(`Access policy not found: ${field}=${value}`, field, value),
              createValidationError: (message: string, field: string) => new AccessPolicyValidationError(message, field, policy.id)
            }
          )
        })
      ),
      E.as(policy)
    )
  }

  delete(
    id: AccessPolicyId
  ): E.Effect<boolean, AccessPolicyNotFoundError | DatabaseError, never> {
    return pipe(
      this.exists(id),
      E.flatMap((exists) =>
        E.if(exists, {
          onTrue: () =>
            pipe(
              E.tryPromise({
                try: () => this.db.delete(accessPolicies).where(eq(accessPolicies.id, id)),
                catch: (error) => translateDbError(
                  error,
                  { operation: "delete", entityType: "AccessPolicy" },
                  {
                    createConflictError: (message: string) => new DatabaseError(message),
                    createNotFoundError: (field: string, value: string) => new AccessPolicyNotFoundError(`Access policy not found: ${field}=${value}`, field, value),
                    createValidationError: (message: string) => new DatabaseError(message)
                  }
                )
              }),
              E.as(true)
            ),
          onFalse: () => E.fail(new AccessPolicyNotFoundError(`Access policy not found: id=${id}`, "id", id))
        })
      )
    )
  }

  deleteByResourceId(
    resourceId: DocumentId
  ): E.Effect<number, AccessPolicyNotFoundError | DatabaseError, never> {
    return pipe(
      E.tryPromise({
        try: async () => {
          const result = await this.db
            .delete(accessPolicies)
            .where(eq(accessPolicies.resourceId, resourceId))
          
          return result.rowCount ?? 0
        },
        catch: (error) => translateQueryError(
          error,
          { operation: "deleteByResourceId", entityType: "AccessPolicy", field: "resourceId", value: resourceId },
          (message, field, value, details) => new AccessPolicyNotFoundError(message, field, value, details)
        )
      })
    )
  }

  deleteByUserId(
    userId: UserId
  ): E.Effect<number, AccessPolicyNotFoundError | DatabaseError, never> {
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
        catch: (error) => translateQueryError(
          error,
          { operation: "deleteByUserId", entityType: "AccessPolicy", field: "userId", value: userId },
          (message, field, value, details) => new AccessPolicyNotFoundError(message, field, value, details)
        )
      })
    )
  }

  list(options?: PaginationOptions): E.Effect<Paginated<AccessPolicyEntity>, AccessPolicyNotFoundError | ValidationError | DatabaseError, Clock.Clock> {
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
        catch: (error) => translateQueryError(
          error,
          { operation: "list", entityType: "AccessPolicy", field: "list", value: "all" },
          (message, field, value, details) => new AccessPolicyNotFoundError(message, field, value, details)
        )
      }),
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
              E.forEach(data, (row) =>
                pipe(
                  AccessPolicyMapper.fromDb(row),
                  E.mapError((error): AccessPolicyNotFoundError | ValidationError =>
                    error instanceof AccessPolicyValidationError
                      ? new ValidationError(error.message, error.field, error.value)
                      : error
                  )
                )
              ),
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
