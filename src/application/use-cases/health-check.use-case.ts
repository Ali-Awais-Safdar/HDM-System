import { Result, ok } from "../../shared/result/result";

export interface HealthStatus {
  ok: boolean;
  service: string;
  version: string;
  timestamp: Date;
  uptime: number;
}

export class HealthCheckUseCase {
  private readonly startTime = Date.now();

  async execute(): Promise<Result<HealthStatus, never>> {
    const healthStatus: HealthStatus = {
      ok: true,
      service: "dms-headless",
      version: "0.1.0",
      timestamp: new Date(),
      uptime: Date.now() - this.startTime
    };

    return ok(healthStatus);
  }
}
