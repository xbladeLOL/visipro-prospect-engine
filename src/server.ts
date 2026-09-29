import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { config } from "./config.js";
import { db } from "./db.js";
import { enqueue } from "./jobs/queue.js";
import { getBusiness, listBusinesses } from "./repositories/businesses.js";
import { enqueueDiscoveryPlan } from "./services/discovery-plan.js";

const app = Fastify({ logger: { level: config.LOG_LEVEL }, trustProxy: true, bodyLimit: 1_000_000 });
await app.register(cors, { origin: config.ALLOWED_ORIGINS.split(",").map((x) => x.trim()) });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health" || req.url === "/ready") return;
  if (req.headers["x-api-key"] !== config.API_KEY) return reply.code(401).send({ error: "unauthorized" });
});
app.get("/health", async () => ({ status: "ok", service: "visipro-prospect-engine" }));
app.get("/ready", async (_req, reply) => { try { await db.query("SELECT 1"); return { status: "ready" }; } catch { return reply.code(503).send({ status: "not_ready" }); } });

app.post("/v1/discovery-runs", async (req, reply) => {
  const body = z.object({ query: z.string().min(2).max(100), city: z.string().min(2).max(100), countryCode: z.string().length(2).default("FR"), limit: z.number().int().min(1).max(100).default(50) }).parse(req.body);
  const jobId = await enqueue("DISCOVER", body, 10); return reply.code(202).send({ jobId, status: "PENDING" });
});
app.post("/v1/discovery-runs/plan", async (_req, reply) => reply.code(202).send({ queued: await enqueueDiscoveryPlan() }));
app.get("/v1/businesses", async (req) => {
  const q = z.object({ status: z.string().optional(), minScore: z.coerce.number().int().min(0).max(100).optional(), city: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }).parse(req.query);
  return { items: await listBusinesses(q), limit: q.limit, offset: q.offset };
});
app.get("/v1/businesses/:id", async (req, reply) => { const { id } = z.object({ id: z.string().uuid() }).parse(req.params); const item = await getBusiness(id); return item ?? reply.code(404).send({ error: "not_found" }); });
app.post("/v1/businesses/:id/reanalyze", async (req, reply) => { const { id } = z.object({ id: z.string().uuid() }).parse(req.params); const jobId = await enqueue("REANALYZE", { businessId: id }, 20); return reply.code(202).send({ jobId }); });
app.patch("/v1/businesses/:id/status", async (req, reply) => { const { id } = z.object({ id: z.string().uuid() }).parse(req.params); const body = z.object({ status: z.enum(["REVIEW","APPROVED","REJECTED","DO_NOT_CONTACT"]), reason: z.string().max(500).optional() }).parse(req.body); const result = await db.query("UPDATE discovered_businesses SET status=$2::business_status,rejection_reason=$3,updated_at=now() WHERE id=$1 RETURNING id,status", [id,body.status,body.reason]); return result.rowCount ? result.rows[0] : reply.code(404).send({ error: "not_found" }); });
app.get("/v1/stats", async () => { const result = await db.query("SELECT count(*)::int total,count(*) FILTER (WHERE status='REVIEW')::int review,count(*) FILTER (WHERE status='APPROVED')::int approved,count(*) FILTER (WHERE status='REJECTED')::int rejected FROM discovered_businesses"); return result.rows[0]; });
app.get("/v1/jobs/:id", async (req, reply) => { const { id }=z.object({id:z.string().uuid()}).parse(req.params); const result=await db.query("SELECT id,type,status,attempts,max_attempts,last_error,created_at,started_at,completed_at FROM jobs WHERE id=$1",[id]); return result.rowCount ? result.rows[0] : reply.code(404).send({error:"not_found"}); });
app.get("/v1/jobs", async (req) => { const q=z.object({status:z.enum(["PENDING","RUNNING","COMPLETED","FAILED","CANCELLED"]).optional(),limit:z.coerce.number().int().min(1).max(100).default(50)}).parse(req.query); const result=await db.query(`SELECT id,type,status,attempts,max_attempts,last_error,payload,created_at,started_at,completed_at FROM jobs WHERE ($1::text IS NULL OR status::text=$1) ORDER BY created_at DESC LIMIT $2`,[q.status ?? null,q.limit]); return {items:result.rows}; });
app.get("/v1/jobs-summary", async () => { const result=await db.query(`SELECT count(*) FILTER(WHERE status='PENDING')::int pending,count(*) FILTER(WHERE status='RUNNING')::int running,count(*) FILTER(WHERE status='COMPLETED')::int completed,count(*) FILTER(WHERE status='FAILED')::int failed,count(*) FILTER(WHERE type='DISCOVER' AND status='RUNNING')::int discovering,count(*) FILTER(WHERE type IN ('ANALYZE_SITE','REANALYZE') AND status='RUNNING')::int analyzing FROM jobs`); return result.rows[0]; });
app.post("/v1/suppressions", async (req, reply) => { const body=z.object({kind:z.enum(["DOMAIN","EMAIL","PHONE","SIREN","PROVIDER_ID"]),value:z.string().min(2).max(255),reason:z.string().max(500).optional()}).parse(req.body); const result=await db.query("INSERT INTO suppression_list(kind,value,reason) VALUES($1,$2,$3) ON CONFLICT(kind,value) DO UPDATE SET reason=excluded.reason RETURNING *",[body.kind,body.value.trim().toLowerCase(),body.reason]); return reply.code(201).send(result.rows[0]); });
app.get("/v1/suppressions", async () => ({items:(await db.query("SELECT * FROM suppression_list ORDER BY created_at DESC LIMIT 500")).rows}));
app.setErrorHandler((error, _req, reply) => { if (error instanceof z.ZodError) return reply.code(400).send({ error: "validation_error", details: error.issues }); app.log.error(error); return reply.code(500).send({ error: "internal_error" }); });
app.addHook("onClose", async () => db.end());
await app.listen({ host: config.HOST, port: config.PORT });
