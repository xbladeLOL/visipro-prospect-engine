import pino from "pino";
import { config } from "./config.js";
import { db } from "./db.js";
import { handleJob } from "./jobs/handlers.js";
import { claimJob, completeJob, failJob, recoverStaleJobs } from "./jobs/queue.js";

const log = pino({ level: config.LOG_LEVEL });
let stopping = false;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loop(slot: number) {
  while (!stopping) {
    const job = await claimJob();
    if (!job) { await delay(1000); continue; }
    try { log.info({ jobId: job.id, type: job.type, slot }, "job started"); await handleJob(job); await completeJob(job.id); log.info({ jobId: job.id }, "job completed"); }
    catch (error) { log.error({ error, jobId: job.id }, "job failed"); await failJob(job, error); }
  }
}

async function main() {
  await recoverStaleJobs();
  log.info({ concurrency: config.WORKER_CONCURRENCY }, "worker started");
  await Promise.all(Array.from({ length: config.WORKER_CONCURRENCY }, (_, i) => loop(i + 1)));
}
async function shutdown(signal: string) { stopping = true; log.info({ signal }, "worker stopping"); setTimeout(() => process.exit(1), 25_000).unref(); await db.end(); }
process.on("SIGTERM", () => void shutdown("SIGTERM")); process.on("SIGINT", () => void shutdown("SIGINT"));
main().catch((error) => { log.fatal(error); process.exit(1); });
