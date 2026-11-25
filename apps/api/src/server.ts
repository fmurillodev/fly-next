import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { defaultWebRoot } from "./http/static-web.js";
import { startupFailureRecord, type StartupStage } from "./shared/observability.js";

let stage: StartupStage = "CONFIG";

try {
  const { host, port, logLevel, rateLimitMax } = loadConfig();
  stage = "INIT";
  const app = buildApp({ logLevel, rateLimitMax, webRoot: defaultWebRoot });

  async function shutdown(): Promise<void> {
    app.log.info({ category: "METRIC", event: "service.stopping" });
    try {
      await app.close();
    } catch {
      process.stderr.write('{"category":"ERROR","event":"service.shutdown_failed"}\n');
      process.exit(1);
    }
  }

  stage = "LISTEN";
  await app.listen({ host, port });
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  app.log.info({ category: "METRIC", event: "service.ready" });
} catch (error) {
  process.stderr.write(`${JSON.stringify(startupFailureRecord(stage, error))}\n`);
  process.exitCode = 1;
}
