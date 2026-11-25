import Fastify, { type FastifyInstance } from "fastify";
import type { HealthResponse } from "@flynext/contracts";

export type BuildAppOptions = { logLevel?: string };

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    // base: null drops pid/hostname from every log line (no host details in public logs).
    logger: { level: options.logLevel ?? "info", base: null },
  });

  app.get("/health", async (): Promise<HealthResponse> => ({ status: "ok" }));

  return app;
}
