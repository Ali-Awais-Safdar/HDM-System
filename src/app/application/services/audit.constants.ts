import { Option } from "effect"
import type { WorkspaceId } from "@domain/refined/ids"

/**
 * Sentinel UUID for audit logging
 */
export const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000"

/**
 * Convert workspace Option to audit ID string
 * 
 * Returns the workspace ID if present, otherwise returns SYSTEM_UUID.
 */
export const workspaceToAuditId = (opt: Option.Option<WorkspaceId>): string =>
  Option.match(opt, {
    onSome: (wid) => wid as string,
    onNone: () => SYSTEM_UUID
  })

