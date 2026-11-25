import { existsSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/** Compiled frontend location, identical from `src/` (dev) and `dist/` (build). */
export const defaultWebRoot = fileURLToPath(new URL("../../web/dist", import.meta.url));

export function hasWebBuild(webRoot: string | undefined): webRoot is string {
  return webRoot !== undefined && existsSync(join(webRoot, "index.html"));
}

/** Serves the compiled frontend; unknown paths still reach the sanitized 404 handler. */
export function registerStaticWeb(app: FastifyInstance, webRoot: string): void {
  void app.register(fastifyStatic, {
    root: webRoot,
    dotfiles: "ignore",
    index: ["index.html"],
    cacheControl: false,
    setHeaders(reply, path) {
      const hashedAsset = path.startsWith(join(webRoot, "assets") + sep);
      reply.header(
        "cache-control",
        hashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
      );
    },
  });
}
