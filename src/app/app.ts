import express from "express";
import { useSecurity } from "../http/middleware/cors-helmet";
import { errorHandler } from "../http/middleware/error-handler";
import { RequestLogger } from "../http/middleware/logger-mw";
import { ParseAuthHeader, VerifyJWT, AttachUser } from "../http/middleware/jwt-mw";
import { healthRouter } from "../http/routes/health";
import { authRouter } from "../web/http/routes/auth.routes";
import { JwtServiceImpl } from "../infra/auth/jwt.service";
import { env } from "../env/env";

export function buildApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  useSecurity(app);

  // Global Chain of Responsibility assembly for authentication
  // This runs on all routes: parse → verify → attach (but doesn't enforce)
  const jwtService = new JwtServiceImpl(env.JWT_SECRET, env.JWT_EXPIRES_IN);
  
  const logger = new RequestLogger();
  const parseAuth = new ParseAuthHeader();
  const verifyJwt = new VerifyJWT(jwtService);
  const attachUser = new AttachUser();

  // Chain: logger → parseAuth → verifyJwt → attachUser
  logger.setNext(parseAuth);
  parseAuth.setNext(verifyJwt);
  verifyJwt.setNext(attachUser);

  app.use((req, res, next) => logger.handle(req, res, next));

  // Routes
  app.use("/", healthRouter);
  app.use("/auth", authRouter);

  // Error handler last
  app.use(errorHandler);

  return app;
}
