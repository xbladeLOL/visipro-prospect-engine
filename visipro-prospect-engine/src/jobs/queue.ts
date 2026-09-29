import os from "node:os";
import { db, transaction } from "../db.js";

export interface Job { id: string; type: "DISCOVER"|"ANALYZE_SITE"|"AI_ANALYZE"|"REANALYZE"; payload: Record<string, unknown>; attempts: number; maxAttempts: number; }
const workerId = `${os.hostname()}:${process.pid}`;

export async function enqueue(type: Job["type"], payload: Record<string, unknown>, priority = 0) {
  const result = await db.query("INSERT INTO jobs(type,payload,priority) VALUES($1,$2,$3) RETURNING id", [type, JSON.stringify(payload), priority]);
  return result.rows[0].id as string;
}

export async function claimJob(allowedTypes?: Job["type"][]): Promise<Job | undefined> {
  return transaction(async (client) => {
    const result = await client.query(`SELECT * FROM jobs WHERE status='PENDING' AND run_after <= now() AND ($1::job_type[] IS NULL OR type = ANY($1)) ORDER BY priority DESC, created_at FOR UPDATE SKIP LOCKED LIMIT 1`, [allowedTypes ?? null]);
    if (!result.rowCount) return undefined;
    const row = result.rows[0];
    await client.query("UPDATE jobs SET status='RUNNING',locked_at=now(),locked_by=$2,started_at=COALESCE(started_at,now()),attempts=attempts+1 WHERE id=$1", [row.id, workerId]);
    return { id: row.id, type: row.type, payload: row.payload, attempts: row.attempts + 1, maxAttempts: row.max_attempts };
  });
}
export async function completeJob(id: string) { await db.query("UPDATE jobs SET status='COMPLETED',completed_at=now(),locked_at=NULL,locked_by=NULL WHERE id=$1", [id]); }
export async function failJob(job: Job, error: unknown) {
  const message = (error instanceof Error ? error.stack ?? error.message : String(error)).slice(0, 8000);
  const retry = job.attempts < job.maxAttempts;
  await db.query(`UPDATE jobs SET status=$2::job_status,last_error=$3,locked_at=NULL,locked_by=NULL,run_after=CASE WHEN $4 THEN now() + make_interval(secs => LEAST(3600, 30 * power(2,$5)::int)) ELSE run_after END,completed_at=CASE WHEN $4 THEN NULL ELSE now() END WHERE id=$1`, [job.id, retry ? "PENDING" : "FAILED", message, retry, job.attempts]);
}
export async function recoverStaleJobs() { return db.query("UPDATE jobs SET status='PENDING',locked_at=NULL,locked_by=NULL,last_error='Recovered after stale worker lock' WHERE status='RUNNING' AND locked_at < now() - interval '20 minutes'"); }
