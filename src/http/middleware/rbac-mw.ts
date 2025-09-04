import { Handler } from "./chain";
import { Request, Response, NextFunction } from "express";
import { UserRole } from "../../domain/entities/user.entity";
import { logSecurityEvent } from "../../shared/logging/logger";

/**
 * RBAC middleware for role-based access control.
 * Works as part of the Chain of Responsibility pattern.
 */
export class RequireRoles extends Handler {
  constructor(private readonly allowedRoles: UserRole[]) {
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
    
    if (!this.allowedRoles.includes(user.role)) {
      logSecurityEvent("authorization_insufficient_permissions", user.id, {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        correlationId: req.correlationId,
        userRole: user.role,
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
        userRole: user.role,
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
export function requireRoles(...roles: UserRole[]): RequireRoles {
  return new RequireRoles(roles);
}

/**
 * Convenience middlewares for common role requirements
 */
export const requireAdmin = () => new RequireRoles(["admin"]);
export const requireUser = () => new RequireRoles(["user", "admin"]);
export const requireAnyRole = () => new RequireRoles(["user", "admin"]);