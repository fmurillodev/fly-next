import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

try {
  const { host, port, logLevel, rateLimitMax } = loadConfig();
  const app = buildApp({ logLevel, rateLimitMax });

  async function shutdown(): Promise<void> {
    app.log.info({ category: "METRIC", event: "service.stopping" });
    try {
      await app.close();
    } catch {
      process.stderr.write('{"category":"ERROR","event":"service.shutdown_failed"}\n');
      process.exit(1);
    }
  }

  await app.listen({ host, port });
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  app.log.info({ category: "METRIC", event: "service.ready" });
} catch {
  process.stderr.write('{"category":"ERROR","event":"service.startup_failed"}\n');
  process.exitCode = 1;
}
