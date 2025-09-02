import { Handler } from "./chain";
import { Request, Response, NextFunction } from "express";
import { ForbiddenError, AuthError } from "../../shared/errors/app-error";
import type { Role } from "../../types/auth";

/**
 * RBAC guard factory. It enforces presence of user (JWT) and role membership.
 */
export function requireRole(...allowed: Role[]) {
  return class RBAC extends Handler {
    override handle(req: Request, _res: Response, next: NextFunction) {
      const user = req.user;
      if (!user) return next(new AuthError());
      if (!allowed.includes(user.role)) return next(new ForbiddenError());
      return super.handle(req, _res, next);
    }
  };
}