import { Handler } from "./chain";
import { Request, Response, NextFunction } from "express";
import { Role } from "../../../app/domain/user/user.entity";
import { logSecurityEvent } from "../../../shared/logging/logger";

/**
 * RBAC middleware for role-based access control.
 * Works as part of the Chain of Responsibility pattern.
 */
export class RequireRoles extends Handler {
  constructor(private readonly allowedRoles: Role[]) {
    super();
  }

  override handle(req: Request, res: Response, next: NextFunction): void {
    const user = req.user;
    
    if (!user) {
      logSecurityEvent("authorization_no_user", undefined, {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        correlationId: req.correlationId,
        requiredRoles: this.allowedRoles
      });
      
      res.status(401).json({ 
        error: "Authentication required",
        code: "UNAUTHORIZED",
        correlationId: req.correlationId
      });
      return;
    }
    
    if (!this.allowedRoles.some(role => user.roles.includes(role))) {
      logSecurityEvent("authorization_insufficient_permissions", user.id, {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        correlationId: req.correlationId,
        userRoles: user.roles,
        requiredRoles: this.allowedRoles
      });
      
      res.status(403).json({ 
        error: "Insufficient permissions",
        code: "FORBIDDEN",
        requiredRoles: this.allowedRoles,
        correlationId: req.correlationId
      });
      return;
    }
    
    // Log successful authorization
    if (req.logger) {
      req.logger.debug({
        userId: user.id,
        userRoles: user.roles,
        requiredRoles: this.allowedRoles,
        method: req.method,
        url: req.url
      }, "Authorization successful");
    }
    
    return super.handle(req, res, next);
  }
}

/**
 * Factory function for creating role-based middleware.
 * Usage: requireRoles("admin", "user")
 */
export function requireRoles(...roles: Role[]): RequireRoles {
  return new RequireRoles(roles);
}

/**
 * Convenience middlewares for common role requirements
 */
export const requireAdmin = () => new RequireRoles(["ADMIN"]);
export const requireUser = () => new RequireRoles(["USER", "ADMIN"]);
export const requireAnyRole = () => new RequireRoles(["USER", "ADMIN"]);