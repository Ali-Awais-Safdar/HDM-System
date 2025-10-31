import { Effect, Option, Clock } from "effect"
import { DocumentAggregate } from "@domain/document/document.aggregate"
import { AccessPolicyRepository } from "@domain/accessPolicy/access-policy.repository"
import { AccessPolicyEntity, type PermissionAction } from "@domain/accessPolicy/access-policy.entity"
import { DatabaseError, ValidationError, BusinessRuleViolationError } from "@domain/utils/base.errors"
import { injectable, inject } from "tsyringe"
import { TOKENS } from "@infra/di/container"

/**
 * DocumentPolicySyncService - Application service for synchronizing collaborator policies
 * 
 * This service handles the synchronization of access policies when a document's
 * publish status changes. It ensures that collaborator policies are restricted
 * to read-only access when a document is unpublished.
 */
@injectable()
export class DocumentPolicySyncService {
  constructor(
    @inject(TOKENS.ACCESS_POLICY_REPOSITORY)
    private readonly accessPolicyRepository: AccessPolicyRepository
  ) {}

  syncCollaboratorPolicies(
    aggregate: DocumentAggregate
  ): Effect.Effect<void, ValidationError | DatabaseError, Clock.Clock> {
    // Only sync policies for unpublished documents
    if (aggregate.document.publishStatus !== "unpublished") {
      return Effect.void
    }

    return this.accessPolicyRepository.findByResourceId(aggregate.document.id).pipe(
      Effect.flatMap((policies) => {
        // Filter to only collaborator policies (non-owner policies)
        const collaboratorPolicies = policies.filter((p) =>
          Option.match(p.subjectId, {
            onNone: () => true, // Role-based policies are collaborators
            onSome: (subjectId) => subjectId !== aggregate.document.ownerId
          })
        )

        // If no collaborator policies exist, nothing to do
        if (collaboratorPolicies.length === 0) {
          return Effect.void
        }

        // Ensure each policy is read-only
        const ensureReadOnly = (
          policy: AccessPolicyEntity
        ): Effect.Effect<AccessPolicyEntity, ValidationError | BusinessRuleViolationError, Clock.Clock> => {
          const actions = policy.actions as readonly PermissionAction[]
          const toRemove = actions.filter((a) => a !== "read")
          const needsRead = !actions.includes("read" as PermissionAction)

          return Effect.succeed(policy).pipe(
            Effect.flatMap((p) =>
              toRemove.length > 0
                ? p.removeActions(toRemove as PermissionAction[])
                : Effect.succeed(p)
            ),
            Effect.flatMap((p) =>
              needsRead ? p.addActions(["read"]) : Effect.succeed(p)
            ),
            Effect.mapError((e) =>
              new ValidationError(
                e instanceof Error ? e.message : String(e),
                (e as any).field,
                (e as any).value
              ) as ValidationError
            )
          )
        }

        // Update and save all collaborator policies
        return Effect.forEach(
          collaboratorPolicies,
          (p) =>
            ensureReadOnly(p).pipe(
              Effect.flatMap((updated) => this.accessPolicyRepository.save(updated))
            ),
          { concurrency: "unbounded", discard: true }
        )
      }),
      Effect.mapError((e) => e as ValidationError | DatabaseError)
    )
  }
}

