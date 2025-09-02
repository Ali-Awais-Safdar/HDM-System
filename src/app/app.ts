import express from "express";
import { useSecurity } from "../http/middleware/cors-helmet";
import { errorHandler } from "../http/middleware/error-handler";
import { RequestLogger } from "../http/middleware/logger-mw";
import { JwtParser } from "../http/middleware/jwt-mw";
import { healthRouter } from "../http/routes/health";

export function buildApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  useSecurity(app);

  // Chain of Responsibility assembly
  const logger = new RequestLogger();
  const jwt = new JwtParser();
  logger.setNext(jwt);

  app.use((req, res, next) => logger.handle(req, res, next));

  // Routes
  app.use("/", healthRouter);

  // Error handler last
  app.use(errorHandler);

  return app;
}
