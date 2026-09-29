import { config } from "../config.js";
import { db } from "../db.js";
import { enqueue } from "../jobs/queue.js";

export async function enqueueDiscoveryPlan(): Promise<number> {
  const result = await db.query<{ query: string; city: string }>(`SELECT term query,z.name city FROM search_zones z CROSS JOIN search_categories c CROSS JOIN LATERAL unnest(c.query_terms) term WHERE z.active AND c.active AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.type='DISCOVER' AND j.status IN ('PENDING','RUNNING') AND j.payload->>'query'=term AND j.payload->>'city'=z.name)`);
  for (const row of result.rows) await enqueue("DISCOVER", { query: row.query, city: row.city, countryCode: "FR", limit: config.DISCOVERY_RESULTS_PER_QUERY }, 1);
  return result.rowCount ?? 0;
}
