import { Router } from "express";
import { HealthCheckUseCase } from "../../../app/application/workflow/health-check.use-case";

export const healthRouter = Router();
const healthCheckUseCase = new HealthCheckUseCase();

healthRouter.get("/health", async (_req, res) => {
  const result = await healthCheckUseCase.execute();
  
  // Since health check never fails, we can safely unwrap
  if (result.ok) {
    res.json(result.value);
  } else {
    // This should never happen for health check, but handle gracefully
    res.status(500).json({ error: "Health check failed" });
  }
});
