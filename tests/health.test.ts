import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../src/app/app";

describe("health", () => {
  it("GET /health -> ok:true", async () => {
    const app = buildApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: "dms-headless", version: "0.1.0" });
  });
});
