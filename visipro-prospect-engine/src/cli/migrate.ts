import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db, transaction } from "../db.js";

const dir = resolve(process.cwd(), "migrations");
await db.query("CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
const files = (await readdir(dir)).filter((x) => x.endsWith(".sql")).sort();
for (const file of files) {
  const done = await db.query("SELECT 1 FROM schema_migrations WHERE version=$1", [file]); if (done.rowCount) continue;
  const sql = await readFile(resolve(dir, file), "utf8");
  await transaction(async (client) => { await client.query(sql); await client.query("INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING", [file]); });
  console.log(`Applied ${file}`);
}
await db.end();
