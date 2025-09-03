import { Router } from "express";
import { PermissionController } from "../controllers/permission.controller";
import { ShareDocumentUseCase } from "../../../application/use-cases/share-document.use-case";
import { RevokeDocumentAccessUseCase } from "../../../application/use-cases/revoke-document-access.use-case";
import { GetDocumentPermissionsUseCase } from "../../../application/use-cases/get-document-permissions.use-case";
import { DrizzleDocumentRepository } from "../../../infra/db/repositories/document.repository";
import { DrizzlePermissionRepository } from "../../../infra/db/repositories/permission.repository";
import { db } from "../../../lib/db/connection";
import { requireAnyRole } from "../../../http/middleware/rbac-mw";
import { RequireAuth } from "../../../http/middleware/jwt-mw";

const permissionRouter = Router();

// Dependencies
const documentRepository = new DrizzleDocumentRepository(db);
const permissionRepository = new DrizzlePermissionRepository(db);

// Use cases
const shareDocumentUseCase = new ShareDocumentUseCase(documentRepository, permissionRepository);
const revokeDocumentAccessUseCase = new RevokeDocumentAccessUseCase(documentRepository, permissionRepository);
const getDocumentPermissionsUseCase = new GetDocumentPermissionsUseCase(documentRepository, permissionRepository);

// Controller
const permissionController = new PermissionController(
  shareDocumentUseCase,
  revokeDocumentAccessUseCase,
  getDocumentPermissionsUseCase
);

// Middleware for authentication and authorization
const requireAuth = new RequireAuth();
const requireUserRole = requireAnyRole();

// Routes

/**
 * POST /documents/:id/share
 * Grant permissions to a user for a specific document.
 * Requires authentication and appropriate access to the document.
 */
permissionRouter.post(
  "/:id/share",
  requireAuth.handle.bind(requireAuth),
  requireUserRole.handle.bind(requireUserRole),
  permissionController.shareDocument
);

/**
 * DELETE /documents/:id/share
 * Revoke permissions from a user for a specific document.
 * Requires authentication and appropriate access to the document.
 */
permissionRouter.delete(
  "/:id/share",
  requireAuth.handle.bind(requireAuth),
  requireUserRole.handle.bind(requireUserRole),
  permissionController.revokeDocumentAccess
);

/**
 * GET /documents/:id/permissions
 * Get all permissions for a specific document.
 * Requires authentication and admin access to the document.
 */
permissionRouter.get(
  "/:id/permissions",
  requireAuth.handle.bind(requireAuth),
  requireUserRole.handle.bind(requireUserRole),
  permissionController.getDocumentPermissions
);

export { permissionRouter };
