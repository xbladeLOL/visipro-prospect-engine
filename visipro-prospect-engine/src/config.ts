import "dotenv/config";
import { z } from "zod";

const bool = z.string().transform((v) => v.toLowerCase() === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  API_KEY: z.string().min(16),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(3),
  DISCOVERY_CONCURRENCY: z.coerce.number().int().min(1).max(2).default(1),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  MAX_SITE_BYTES: z.coerce.number().int().min(100000).max(10000000).default(3000000),
  MAX_PAGES_PER_SITE: z.coerce.number().int().min(1).max(10).default(5),
  USER_AGENT: z.string().default("VisiProProspectBot/0.1"),
  DISCOVERY_PROVIDER: z.enum(["dataforseo", "serpapi", "mock"]).default("mock"),
  DATAFORSEO_LOGIN: z.string().default(""),
  DATAFORSEO_PASSWORD: z.string().default(""),
  SERPAPI_KEY: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  SCREENSHOT_ENABLED: bool.default(false),
  PLAYWRIGHT_CHROMIUM_PATH: z.string().default("/usr/bin/chromium"),
  RETENTION_DAYS: z.coerce.number().int().min(30).max(730).default(180)
  ,SCHEDULER_ENABLED: bool.default(true)
  ,DISCOVERY_SCHEDULE_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(2)
  ,DISCOVERY_RESULTS_PER_QUERY: z.coerce.number().int().min(1).max(100).default(30)
});

export type Config = z.infer<typeof schema>;
export const config = schema.parse(process.env);
