import type { AccessPolicy } from "@domain/accessPolicy/access-policy.schema"

export const isAccessPolicy = (u: unknown): u is AccessPolicy =>
  !!u && typeof u === "object" && "resourceType" in (u as any)
