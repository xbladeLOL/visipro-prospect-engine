import { db } from "../db.js";
import { analyzeSite } from "../analyzer/site-analyzer.js";
import { createProvider } from "../providers/index.js";
import { getBusiness, saveAnalysis, saveScore, upsertBusiness } from "../repositories/businesses.js";
import { scoreBusiness } from "../scoring/scorer.js";
import { enqueue, type Job } from "./queue.js";

export async function handleJob(job: Job): Promise<void> {
  if (job.type === "DISCOVER") return discover(job.id, job.payload);
  if (job.type === "ANALYZE_SITE" || job.type === "REANALYZE") return analyze(String(job.payload.businessId));
  throw new Error(`Unsupported job type: ${job.type}`);
}

async function discover(parentJobId: string, payload: Record<string, unknown>) {
  const query = String(payload.query ?? ""); const city = String(payload.city ?? "");
  if (!query || !city) throw new Error("Discovery job requires query and city");
  const provider = createProvider();
  const run = await db.query("INSERT INTO discovery_runs(provider,query) VALUES($1,$2) RETURNING id", [provider.name, `${query} ${city}`]);
  try {
    const found = await provider.search({ query, city, countryCode: String(payload.countryCode ?? "FR"), limit: Number(payload.limit ?? 50) });
    let newCount = 0;
    for (const input of found) {
      const { business, created } = await upsertBusiness(input); if (created) newCount++;
      if (business.status !== "DO_NOT_CONTACT") await enqueue("ANALYZE_SITE", { businessId: business.id, parentJobId }, 5);
    }
    await db.query("UPDATE discovery_runs SET status='COMPLETED',found_count=$2,new_count=$3,completed_at=now() WHERE id=$1", [run.rows[0].id, found.length, newCount]);
  } catch (error) {
    await db.query("UPDATE discovery_runs SET status='FAILED',error=$2,completed_at=now() WHERE id=$1", [run.rows[0].id, error instanceof Error ? error.message : String(error)]); throw error;
  }
}

async function analyze(id: string) {
  const business = await getBusiness(id); if (!business) throw new Error(`Business ${id} not found`);
  await db.query("UPDATE discovered_businesses SET status='ANALYZING',updated_at=now() WHERE id=$1", [id]);
  const analysis = business.websiteUrl ? await analyzeSite(business.websiteUrl) : undefined;
  if (analysis) await saveAnalysis(id, analysis);
  await saveScore(id, scoreBusiness(business, analysis));
}
