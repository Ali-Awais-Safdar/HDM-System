import { Handler } from "./chain";
import { Request, Response, NextFunction } from "express";
import { JwtService } from "../../application/ports/jwt.service";
import { asUserId } from "../../shared/types/brand";

/**
 * Chain of Responsibility handlers for authentication flow:
 * ParseAuthHeader → VerifyJWT → AttachUser → RequireAuth/RBAC
 */

/**
 * Step 1: Parse Authorization header and extract token
 */
export class ParseAuthHeader extends Handler {
  override handle(req: Request, res: Response, next: NextFunction): void {
    const auth = req.headers.authorization;
    
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice("Bearer ".length);
      (req as any).authToken = token;
    }
    
    return super.handle(req, res, next);
  }
}

/**
 * Step 2: Verify JWT token and extract payload
 */
export class VerifyJWT extends Handler {
  constructor(private readonly jwtService: JwtService) {
    super();
  }

  override handle(req: Request, res: Response, next: NextFunction): void {
    const token = (req as any).authToken;
    
    if (token) {
      this.jwtService.verifyToken(token)
        .then(result => {
          if (result.ok) {
            (req as any).jwt = result.value;
          }
          return super.handle(req, res, next);
        })
        .catch(() => {
          // Token verification failed, but continue (enforcement in RequireAuth)
          return super.handle(req, res, next);
        });
    } else {
      return super.handle(req, res, next);
    }
  }
}

/**
 * Step 3: Attach user information to request
 */
export class AttachUser extends Handler {
  override handle(req: Request, res: Response, next: NextFunction): void {
    const jwt = (req as any).jwt;
    
    if (jwt) {
      req.user = {
        id: asUserId(jwt.userId),
        role: jwt.role,
        email: jwt.email
      };
    }
    
    return super.handle(req, res, next);
  }
}

/**
 * Step 4: Require authentication (use this for protected routes)
 */
export class RequireAuth extends Handler {
  override handle(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(401).json({ 
        error: "Authentication required",
        code: "UNAUTHORIZED" 
      });
      return;
    }
    
    return super.handle(req, res, next);
  }
}