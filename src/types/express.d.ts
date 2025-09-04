import "express";
import type { AuthUser } from "./auth";
import type { Logger } from 'pino';

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
    correlationId?: string;
    logger?: Logger;
  }
}