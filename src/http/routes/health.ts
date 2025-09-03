import { Router } from "express";
import { HealthCheckUseCase } from "../../application/use-cases/health-check.use-case";

export const healthRouter = Router();
const healthCheckUseCase = new HealthCheckUseCase();

healthRouter.get("/health", async (_req, res) => {
  const result = await healthCheckUseCase.execute();
  
  // Since health check never fails, we can safely unwrap
  const healthStatus = result.value;
  res.json(healthStatus);
});
