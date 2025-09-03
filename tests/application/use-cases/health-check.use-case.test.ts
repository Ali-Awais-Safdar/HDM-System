import { describe, it, expect } from "vitest";
import { HealthCheckUseCase } from "../../../src/application/use-cases/health-check.use-case";

describe("HealthCheckUseCase", () => {
  it("should return health status with correct structure", async () => {
    const useCase = new HealthCheckUseCase();
    const result = await useCase.execute();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        ok: true,
        service: "dms-headless",
        version: "0.1.0"
      });
      expect(result.value.timestamp).toBeInstanceOf(Date);
      expect(typeof result.value.uptime).toBe("number");
      expect(result.value.uptime).toBeGreaterThanOrEqual(0);
    }
  });

  it("should return increasing uptime on subsequent calls", async () => {
    const useCase = new HealthCheckUseCase();
    
    const result1 = await useCase.execute();
    await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
    const result2 = await useCase.execute();

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    
    if (result1.ok && result2.ok) {
      expect(result2.value.uptime).toBeGreaterThan(result1.value.uptime);
    }
  });
});
