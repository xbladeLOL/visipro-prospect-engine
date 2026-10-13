import { config } from "../config.js";
import { db } from "../db.js";
import { enqueue } from "../jobs/queue.js";

export async function enqueueDiscoveryPlan(): Promise<number> {
  const result = await db.query<{ query: string; city: string }>(`SELECT c.query_terms[1] query,z.name city FROM search_zones z CROSS JOIN search_categories c WHERE z.active AND c.active AND c.query_terms[1] IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.type='DISCOVER' AND j.status IN ('PENDING','RUNNING') AND j.payload->>'query'=c.query_terms[1] AND j.payload->>'city'=z.name) ORDER BY (SELECT max(j.created_at) FROM jobs j WHERE j.type='DISCOVER' AND j.payload->>'query'=c.query_terms[1] AND j.payload->>'city'=z.name) ASC NULLS FIRST,c.lead_value_score DESC,z.name LIMIT $1`,[config.DISCOVERY_MAX_QUERIES_PER_RUN]);
  for (const row of result.rows) await enqueue("DISCOVER", { query: row.query, city: row.city, countryCode: "FR", limit: config.DISCOVERY_RESULTS_PER_QUERY, requireEmail: config.DISCOVERY_REQUIRE_EMAIL }, 1);
  return result.rowCount ?? 0;
}
