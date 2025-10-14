import { Schema as S } from "effect"
import { PermissionActionSchema, type PermissionAction, type PermissionLevel } from "@domain/accessPolicy/access-policy.schema"

export const PermissionSet = S.Struct({
  actions: S.Array(PermissionActionSchema)
})
export type PermissionSet = S.Schema.Type<typeof PermissionSet>

// Synchronous version used across entities/services
export const computePermissionLevelSync = (ps: PermissionSet): PermissionLevel => {
  const has = (a: PermissionAction) => ps.actions.includes(a)
  if (has("delete") || has("share")) return "admin"
  if (has("update") || has("download")) return "write"
  if (has("read")) return "read"
  return "read"
}

export const PermissionLevelOrder: Record<PermissionLevel, number> = {
  read: 1,
  write: 2,
  admin: 3
}

export const isAtLeast = (level: PermissionLevel, required: PermissionLevel): boolean =>
  PermissionLevelOrder[level] >= PermissionLevelOrder[required]

export const maxLevel = (levels: ReadonlyArray<PermissionLevel>): PermissionLevel | null => {
  if (levels.length === 0) return null
  return levels.reduce((h, c) =>
    PermissionLevelOrder[c] > PermissionLevelOrder[h] ? c : h
  )
}

