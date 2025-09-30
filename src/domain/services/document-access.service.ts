import type { User } from "../schema/user.schema";
import type {
  AccessPolicy,
  AccessPolicyArray,
  PermissionAction,
  Role
} from "../schema/access-policy.schema";

export type DocumentLike = {
  id: string;
  ownerId: string;
  workspaceId: string;
};

const hasExplicitUserPolicy = (
  policies: AccessPolicyArray,
  userId: string,
  documentId: string,
  action: PermissionAction
): boolean =>
  policies.some(
    p =>
      p.resourceType === "document" &&
      p.resourceId === documentId &&
      p.subjectType === "user" &&
      p.subjectId === userId &&
      p.actions.includes(action)
  );

const hasRolePolicy = (
  policies: AccessPolicyArray,
  roles: ReadonlyArray<Role>,
  documentId: string,
  action: PermissionAction
): boolean =>
  policies.some(
    p =>
      p.resourceType === "document" &&
      p.resourceId === documentId &&
      p.subjectType === "role" &&
      p.role !== undefined &&
      roles.includes(p.role) &&
      p.actions.includes(action)
  );

export const hasPermission = (
  user: User,
  document: DocumentLike,
  action: PermissionAction,
  policies: AccessPolicyArray
): boolean => {
  // 0) Owner shortcut (optional): treat as explicit subject allow
  // If you must strictly follow "Admin > explicit > role > default", you can drop this and encode "owner" via a user policy on creation.
  const ownerAllow =
    user.id === document.ownerId &&
    (action === "read" || action === "update" || action === "delete" || action === "download" || action === "share");

  // 1) Admin
  if (user.roles.includes("ADMIN")) return true;

  // 2) Explicit subject policy (user)
  if (hasExplicitUserPolicy(policies, user.id, document.id, action)) return true;

  // 3) Role policy
  if (hasRolePolicy(policies, user.roles, document.id, action)) return true;

  // (optional) owner fallback precedence could be here if you keep it:
  if (ownerAllow) return true;

  // 4) Default deny
  return false;
};

// Optional Effect-flavored adapter (still pure; returns an Effect that's immediately runnable when needed):
export const hasPermissionE = (user: User, document: DocumentLike, action: PermissionAction, policies: AccessPolicyArray) => 
  hasPermission(user, document, action, policies);
