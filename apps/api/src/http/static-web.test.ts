import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

const webRoot = mkdtempSync(join(tmpdir(), "flynext-web-"));
mkdirSync(join(webRoot, "assets"));
writeFileSync(join(webRoot, "index.html"), "<!doctype html><title>FlyNext web</title>");
writeFileSync(join(webRoot, "assets", "app-abc123.js"), "console.log('app');");

const apps = [buildApp({ logLevel: "silent", webRoot })];
const apiOnly = buildApp({ logLevel: "silent", webRoot: join(webRoot, "missing") });
const [withWeb] = apps;
if (withWeb === undefined) throw new Error("App was not built");

afterAll(async () => {
  await Promise.all([withWeb.close(), apiOnly.close()]);
  rmSync(webRoot, { recursive: true, force: true });
});

describe("static web integration", () => {
  it("serves the compiled frontend at / and its assets with cache headers", async () => {
    const index = await withWeb.inject({ method: "GET", url: "/" });
    expect(index.statusCode).toBe(200);
    expect(index.headers["content-type"]).toMatch(/^text\/html/);
    expect(index.headers["cache-control"]).toBe("no-cache");
    expect(index.body).toContain("FlyNext web");

    const asset = await withWeb.inject({ method: "GET", url: "/assets/app-abc123.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("keeps API, health and docs routes ahead of the static files", async () => {
    expect((await withWeb.inject({ method: "GET", url: "/health" })).json()).toEqual({
      status: "ok",
    });
    expect((await withWeb.inject({ method: "GET", url: "/docs/json" })).statusCode).toBe(200);
    const assessment = await withWeb.inject({
      method: "POST",
      url: "/api/v1/disruptions/assessment",
      payload: { bookingId: "ABC123" },
    });
    expect(assessment.statusCode).toBe(200);
    expect(assessment.json()).toMatchObject({ assessmentStatus: "PARTIAL" });
  });

  it("does not turn unknown routes into HTML", async () => {
    for (const url of ["/api/v1/unknown", "/missing", "/assets/missing.js"]) {
      const response = await withWeb.inject({ method: "GET", url });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        statusCode: 404,
        error: "Not Found",
        message: "Route not found",
      });
    }
  });

  it("falls back to the API-only service info when the web build is missing", async () => {
    const response = await apiOnly.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: "FlyNext", docs: "/docs" });
  });
});
