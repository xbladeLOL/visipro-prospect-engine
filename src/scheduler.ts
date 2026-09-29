import pino from "pino";
import { config } from "./config.js";
import { db } from "./db.js";
import { enqueueDiscoveryPlan } from "./services/discovery-plan.js";

const log = pino({ level: config.LOG_LEVEL });
let stopping = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function nextRun(): Date { const now=new Date(); const next=new Date(now); next.setUTCHours(config.DISCOVERY_SCHEDULE_HOUR_UTC,0,0,0); if(next<=now) next.setUTCDate(next.getUTCDate()+1); return next; }
async function main() {
  log.info({ enabled: config.SCHEDULER_ENABLED, hourUtc: config.DISCOVERY_SCHEDULE_HOUR_UTC }, "scheduler started");
  while (!stopping) {
    if (!config.SCHEDULER_ENABLED) { await sleep(60_000); continue; }
    const runAt=nextRun(); log.info({ runAt }, "next discovery planned");
    while (!stopping && Date.now()<runAt.getTime()) await sleep(Math.min(60_000,runAt.getTime()-Date.now()));
    if (!stopping) { const count=await enqueueDiscoveryPlan(); log.info({ count }, "discovery plan queued"); }
  }
}
async function shutdown(){stopping=true; await db.end();}
process.on("SIGTERM",()=>void shutdown()); process.on("SIGINT",()=>void shutdown());
main().catch((error)=>{log.fatal(error);process.exit(1);});
