import "reflect-metadata"

import { Effect, Option, pipe, Schema as S, ParseResult, Clock } from "effect"
import { injectable, inject } from "tsyringe"

// Domain entities
import { UserEntity, SerializedUser } from "@domain/user/user.entity"

// Domain repositories
import { UserRepository } from "@domain/user/user.repository"

// Application errors
import { 
  PermissionCheckError, 
  WorkflowDependencyError,
  PersistenceDependencyError,
  InteractionValidationError
} from "@application/errors/application.errors"
import type { InfraUnexpected } from "@infra/errors/infrastructure.errors"

// Application DTOs
import {
  SignUpInputSchema,
  SignUpInputEncoded,
  LoginInputSchema,
  LoginInputEncoded,
  ChangePasswordCommandSchema,
  ChangePasswordCommandEncoded
} from "@application/dto/user/commands.dto"
import {
  GetProfileQuerySchema,
  GetProfileQueryEncoded
} from "@application/dto/user/queries.dto"
import {
  UserSummaryEncoded,
  LoginResponseEncoded,
  SignUpResponseEncoded,
  ChangePasswordResponseEncoded
} from "@application/dto/user/responses.dto"

// Application workflow helpers
import {
  createEntityId,
  loadActor,
  serializeUserSummary,
  recordAudit,
  mapUserPersistenceError,
  mapUserDomainError,
  ensureSelfOrAdmin
} from "@application/workflow/helpers"

// Application ports
import { PasswordHasherPort } from "@application/services/ports/password-hasher.port"
import { AuthTokenPort } from "@application/services/ports/auth-token.port"
import { AuditPort } from "@application/services/ports/audit.port"

// Refined types
import { UserId } from "@domain/refined/ids"
import { HashedPassword } from "@domain/refined/hashed-password"
import { Role } from "@domain/accessPolicy/access-policy.schema"

// DI tokens
import { TOKENS } from "@infra/di/container"

/**
 * UserWorkflow - Application layer workflow for user operations
 * 
 * Responsibilities:
 * - Coordinate user authentication and authorization operations
 * - Handle sign-up, login, password changes, and profile retrieval
 * - Integrate password hashing and token generation
 * - Map user errors to application-level errors
 */
@injectable()
export class UserWorkflow {
  constructor(
    @inject(TOKENS.USER_REPOSITORY)
    private readonly userRepository: UserRepository,

    @inject(TOKENS.PASSWORD_HASHER_PORT)
    private readonly passwordHasher: PasswordHasherPort,

    @inject(TOKENS.AUTH_TOKEN_PORT)
    private readonly authToken: AuthTokenPort,

    @inject(TOKENS.AUDIT_PORT)
    private readonly audit: AuditPort
  ) {}

  signUp(
    input: SignUpInputEncoded
  ): Effect.Effect<SignUpResponseEncoded, WorkflowDependencyError | PersistenceDependencyError | InteractionValidationError | InfraUnexpected | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(SignUpInputSchema)(input),
      Effect.flatMap((dto) =>
        pipe(
          // 2. Check email uniqueness
          this.userRepository.findByEmail(dto.email),
          Effect.catchAll(mapUserPersistenceError("findByEmail")),
          Effect.flatMap((existingUser) =>
            Option.match(existingUser, {
              onSome: () => Effect.fail(new WorkflowDependencyError(
                `User with email ${dto.email} already exists`,
                "UserRepository",
                "findByEmail",
                { email: dto.email }
              )),
              onNone: () => Effect.void
            })
          ),
          Effect.flatMap(() =>
            // 3. Generate ID and get current timestamp
            Effect.all([
              createEntityId(UserId, "UserId"),
              Clock.currentTimeMillis.pipe(Effect.map((ms) => new Date(ms)))
            ])
          ),
          Effect.flatMap(([validatedId, now]) =>
            // 5. Hash password
            this.passwordHasher.hash(dto.password).pipe(
              Effect.mapError((error) => new WorkflowDependencyError(
                `Failed to hash password: ${error.message}`,
                "PasswordHasher",
                "hash",
                { originalError: error }
              )),
              Effect.flatMap((hashedPassword) =>
                // 6. Validate hashed password
                S.decodeUnknown(HashedPassword)(hashedPassword).pipe(
                  Effect.mapError((error) => new WorkflowDependencyError(
                    `Failed to validate hashed password: ${error.message}`,
                    "HashedPassword",
                    "validation",
                    { originalError: error }
                  )),
                  Effect.flatMap((validatedHash) => {
                    // 7. Build user data with validated ID and timestamp
                    const defaultRoles = ["USER"] as const satisfies readonly Role[]
                    const userData: Partial<SerializedUser> = {
                      id: validatedId,
                      email: dto.email,
                      passwordHash: validatedHash,
                      roles: dto.roles || defaultRoles,
                      createdAt: now.toISOString(),
                      updatedAt: undefined
                    }

                    // 8. Create UserEntity and catch domain errors
                    return pipe(
                      UserEntity.create(userData as SerializedUser),
                      Effect.catchAll(mapUserDomainError("create"))
                    )
                  })
                )
              )
            )
          ),
          Effect.flatMap((user) =>
            // 9. Persist user
            this.userRepository.save(user).pipe(
              Effect.catchAll(mapUserPersistenceError("save"))
            )
          ),
          Effect.flatMap((savedUser) =>
            // 10. Record audit event
            recordAudit(this.audit, {
              actorId: savedUser.id,
              workspaceId: Option.match(savedUser.workspaceId, {
                onSome: (wid) => wid as string,
                onNone: () => "system"
              }),
              resourceType: "user",
              resourceId: savedUser.id,
              action: "signup",
              outcome: "success" as const,
              metadata: { email: savedUser.email }
            }).pipe(
              Effect.map(() => savedUser)
            )
          ),
          Effect.flatMap((savedUser) =>
            // 11. Serialize user summary and return
            serializeUserSummary(savedUser).pipe(
              Effect.map((userSummary) => ({
                user: userSummary,
                session: undefined // No automatic login on sign-up
              }))
            )
          )
        )
      )
    ) as Effect.Effect<SignUpResponseEncoded, WorkflowDependencyError | PersistenceDependencyError | InteractionValidationError | InfraUnexpected | ParseResult.ParseError, Clock.Clock>
  }

  login(
    input: LoginInputEncoded
  ): Effect.Effect<LoginResponseEncoded, PermissionCheckError | WorkflowDependencyError | PersistenceDependencyError | InteractionValidationError | InfraUnexpected | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(LoginInputSchema)(input),
      Effect.flatMap((dto) =>
        pipe(
          // 2. Load user by email
          this.userRepository.findByEmail(dto.email),
          Effect.catchAll(mapUserPersistenceError("findByEmail")),
          Effect.flatMap((userOption) =>
            Option.match(userOption, {
              onNone: () => Effect.fail(new PermissionCheckError(
                `Invalid credentials`,
                "email",
                dto.email,
                "authentication"
              )),
              onSome: (user) => Effect.succeed(user)
            })
          ),
          Effect.flatMap((user) =>
            // 3. Verify password
            this.passwordHasher.verify(dto.password, user.passwordHash).pipe(
              Effect.mapError((error) => new WorkflowDependencyError(
                `Failed to verify password: ${error.message}`,
                "PasswordHasher",
                "verify",
                { originalError: error }
              )),
              Effect.flatMap((isValid) =>
                isValid
                  ? Effect.succeed(user)
                  : Effect.fail(new PermissionCheckError(
                      `Invalid credentials`,
                      "password",
                      "",
                      "authentication"
                    ))
              )
            )
          ),
          Effect.flatMap((authenticatedUser) =>
            // 4. Record successful audit
            recordAudit(this.audit, {
              actorId: authenticatedUser.id,
              workspaceId: Option.match(authenticatedUser.workspaceId, {
                onSome: (wid) => wid as string,
                onNone: () => "system"
              }),
              resourceType: "user",
              resourceId: authenticatedUser.id,
              action: "login",
              outcome: "success" as const,
              metadata: { email: authenticatedUser.email }
            }).pipe(
              Effect.map(() => authenticatedUser)
            )
          ),
          Effect.flatMap((authenticatedUser) =>
            // 5. Generate token
            this.authToken.generateToken({
              userId: authenticatedUser.id,
              workspaceId: authenticatedUser.workspaceId,
              roles: authenticatedUser.roles
            }).pipe(
              Effect.mapError((error) => new WorkflowDependencyError(
                `Failed to generate auth token: ${error.message}`,
                "AuthTokenPort",
                "generateToken",
                { originalError: error }
              )),
              Effect.map((tokenData) => ({ authenticatedUser, tokenData }))
            )
          )
        )
      ),
      Effect.flatMap(({ authenticatedUser, tokenData }) =>
        // 6. Serialize user summary
        serializeUserSummary(authenticatedUser).pipe(
          Effect.map((userSummary) => ({
            user: userSummary,
            session: {
              token: tokenData.token,
              expiresAt: tokenData.expiresAt.toISOString()
            }
          }))
        )
      ),
      Effect.catchAll((error) => {
        // Extract email from input for audit on failure
        const emailForAudit = (() => {
          try {
            const result = S.decodeUnknownSync(LoginInputSchema)(input)
            return result.email
          } catch {
            return "unknown"
          }
        })()
        
        // Record failed login attempt (best effort, don't fail workflow)
        return pipe(
          recordAudit(this.audit, {
            actorId: "system" as UserId,
            workspaceId: "system",
            resourceType: "user",
            resourceId: emailForAudit,
            action: "login",
            outcome: "failure" as const,
            metadata: { 
              email: emailForAudit, 
              error: error instanceof Error ? error.message : String(error) 
            }
          }),
          Effect.orElseSucceed(() => undefined),
          Effect.flatMap(() => Effect.fail(error))
        )
      })
    )
  }

  changePassword(
    input: ChangePasswordCommandEncoded
  ): Effect.Effect<ChangePasswordResponseEncoded, PermissionCheckError | WorkflowDependencyError | PersistenceDependencyError | InteractionValidationError | InfraUnexpected | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(ChangePasswordCommandSchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load target user and actor in parallel
        Effect.all([
          loadActor(this.userRepository, dto.userId),
          loadActor(this.userRepository, dto.actorId)
        ]).pipe(
          Effect.flatMap(([targetUser, actor]) =>
            // 3. Ensure actor is same user or admin
            ensureSelfOrAdmin(actor, targetUser).pipe(
              Effect.map(() => ({ targetUser, actor }))
            )
          ),
          Effect.flatMap(({ targetUser, actor }) =>
            // 4. Verify current password (if changing own password)
            targetUser.id === actor.id
              ? this.passwordHasher.verify(dto.oldPassword, targetUser.passwordHash).pipe(
                  Effect.mapError((error) => new WorkflowDependencyError(
                    `Failed to verify current password: ${error.message}`,
                    "PasswordHasher",
                    "verify",
                    { originalError: error }
                  )),
                  Effect.flatMap((isValid) =>
                    isValid
                      ? Effect.succeed({ targetUser, actor })
                      : Effect.fail(new PermissionCheckError(
                          `Current password is incorrect`,
                          "oldPassword",
                          "",
                          "authentication"
                        ))
                  )
                )
              : Effect.succeed({ targetUser, actor })
          ),
          Effect.flatMap(({ targetUser, actor }) =>
            // 5. Hash new password
            this.passwordHasher.hash(dto.newPassword).pipe(
              Effect.mapError((error) => new WorkflowDependencyError(
                `Failed to hash new password: ${error.message}`,
                "PasswordHasher",
                "hash",
                { originalError: error }
              )),
              Effect.map((hashedPassword) => ({ targetUser, actor, hashedPassword }))
            )
          ),
          Effect.flatMap(({ targetUser, actor, hashedPassword }) =>
            // 6. Validate hashed password
            S.decodeUnknown(HashedPassword)(hashedPassword).pipe(
              Effect.mapError((error) => new WorkflowDependencyError(
                `Failed to validate hashed password: ${error.message}`,
                "HashedPassword",
                "validation",
                { originalError: error }
              )),
              Effect.map((validatedHash) => ({ targetUser, actor, validatedHash }))
            )
          ),
          Effect.flatMap(({ targetUser, actor, validatedHash }) =>
            // 7. Update password hash on entity
            targetUser.updatePasswordHash(validatedHash).pipe(
              Effect.map((updatedUser) => ({ updatedUser, actor }))
            )
          )
        )
      ),
      Effect.catchAll(mapUserDomainError("updatePasswordHash")),
      Effect.flatMap(({ updatedUser, actor }) =>
        // 8. Persist updated user
        this.userRepository.save(updatedUser).pipe(
          Effect.catchAll(mapUserPersistenceError("save")),
          Effect.map(() => ({ updatedUser, actor }))
        )
      ),
      Effect.flatMap(({ updatedUser, actor }) =>
        // 9. Record audit event
        recordAudit(this.audit, {
          actorId: actor.id,
          workspaceId: Option.match(actor.workspaceId, {
            onSome: (wid) => wid as string,
            onNone: () => "system"
          }),
          resourceType: "user",
          resourceId: updatedUser.id,
          action: "change_password",
          outcome: "success" as const,
          metadata: { userId: updatedUser.id }
        }).pipe(
          Effect.map(() => ({ success: true, message: "Password changed successfully" }))
        )
      )
    )
  }

  getProfile(
    input: GetProfileQueryEncoded
  ): Effect.Effect<UserSummaryEncoded, PermissionCheckError | WorkflowDependencyError | ParseResult.ParseError, Clock.Clock> {
    return pipe(
      // 1. Decode DTO using schema validation
      S.decodeUnknown(GetProfileQuerySchema)(input),
      Effect.flatMap((dto) =>
        // 2. Load actor and serialize
        loadActor(this.userRepository, dto.actorId).pipe(
          Effect.flatMap((actor) =>
            serializeUserSummary(actor)
          )
        )
      )
    )
  }
}

