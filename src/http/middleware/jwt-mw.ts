import { Handler } from "./chain";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../env/env";
import type { Role } from "../../types/auth";

// Minimal shape we expect inside JWT
interface JwtClaims {
  sub: string;        // user id
  role: Role;
  email?: string;
  iat?: number;
  exp?: number;
}

/**
 * Parses JWT if present. Does not enforce auth; enforcement happens via RBAC guard.
 */
export class JwtParser extends Handler {
  override handle(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers["authorization"];
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice("Bearer ".length);
      try {
        const payload = jwt.verify(token, env.JWT_SECRET);
        if (typeof payload === "object" && payload && "sub" in payload && "role" in payload) {
          const p = payload as JwtClaims;
          req.user = { id: p.sub, role: p.role, email: p.email };
        }
      } catch {
        // swallow parse error: enforcement is done by RBAC when needed
      }
    }
    return super.handle(req, res, next);
  }
}