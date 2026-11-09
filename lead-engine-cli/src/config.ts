import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const schema = z.object({
  GEMINI_API_KEY_1: z.string().optional(),
  GEMINI_API_KEY_2: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  THINKING_BUDGET_HEAVY: z.coerce.number().int().min(0).max(8192).default(2048),
  REMOTE_APP_URL: z.string().url(),
  SYNC_SECRET_TOKEN: z.string().min(8),
  CDP_URL: z.string().url().default("http://localhost:9222"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(customEnv?: Record<string, string | undefined>): Config {
  const isProd = process.argv.includes("--prod") || process.argv.includes("--remote");
  const isLocal = process.argv.includes("--local");

  const envCopy = { ...process.env, ...customEnv };
  if (isProd) {
    envCopy.REMOTE_APP_URL = envCopy.REMOTE_APP_URL_PROD || "https://lead-dashboard-8bx.pages.dev";
  } else if (isLocal) {
    envCopy.REMOTE_APP_URL = "http://127.0.0.1:8788";
  }

  const parsed = schema.safeParse(envCopy);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuration .env invalide :\n${issues}`);
  }
  return { ...parsed.data, REMOTE_APP_URL: parsed.data.REMOTE_APP_URL.replace(/\/+$/, "") };
}
