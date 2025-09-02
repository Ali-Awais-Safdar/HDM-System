import { Handler } from "./chain";
import { Request, Response, NextFunction } from "express";
import { logger } from "../../shared/logging/logger";

export class RequestLogger extends Handler {
  override handle(req: Request, _res: Response, next: NextFunction) {
    logger.debug({ method: req.method, url: req.url }, "Incoming request");
    return super.handle(req, _res, next);
  }
}
