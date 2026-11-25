import { z } from "zod";

const envSchema = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  // Strict decimal digits only: "", " ", "1e3", "80.5" and "-1" must fail instead of coercing silently.
  PORT: z
    .string()
    .regex(/^[0-9]+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535))
    .default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type AppConfig = { host: string; port: number; logLevel: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return { host: parsed.HOST, port: parsed.PORT, logLevel: parsed.LOG_LEVEL };
}
