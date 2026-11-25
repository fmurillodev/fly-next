import { healthResponseSchema } from "@flynext/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

describe("GET /health", () => {
  const app = buildApp({ logLevel: "silent" });
  afterAll(() => app.close());

  it("returns 200 with the shared health contract", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({ status: "ok" });
  });

  it("does not expose unknown routes", async () => {
    const response = await app.inject({ method: "GET", url: "/nope" });
    expect(response.statusCode).toBe(404);
  });
});

describe("loadConfig", () => {
  it("defaults to 0.0.0.0:3000 for container deployments", () => {
    expect(loadConfig({})).toMatchObject({ host: "0.0.0.0", port: 3000 });
  });

  it("honors the PORT variable provided by the platform", () => {
    expect(loadConfig({ PORT: "8080" }).port).toBe(8080);
  });

  it("rejects an invalid PORT", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow();
  });
});
