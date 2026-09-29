import { config } from "../config.js";
import type { DiscoveredBusinessInput } from "../domain.js";
import type { DiscoveryProvider, DiscoveryQuery } from "./provider.js";

export class DataForSeoProvider implements DiscoveryProvider {
  readonly name = "dataforseo";
  async search(input: DiscoveryQuery): Promise<DiscoveredBusinessInput[]> {
    if (!config.DATAFORSEO_LOGIN || !config.DATAFORSEO_PASSWORD) throw new Error("DataForSEO credentials are missing");
    const auth = Buffer.from(`${config.DATAFORSEO_LOGIN}:${config.DATAFORSEO_PASSWORD}`).toString("base64");
    const res = await fetch("https://api.dataforseo.com/v3/serp/google/maps/live/advanced", { method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/json" }, body: JSON.stringify([{ keyword: `${input.query} ${input.city}`, location_name: `${input.city},France`, language_code: "fr", depth: input.limit ?? 50 }]) });
    if (!res.ok) throw new Error(`DataForSEO returned ${res.status}`);
    const json = await res.json() as any;
    const items: Record<string, any>[] = json.tasks?.[0]?.result?.[0]?.items ?? [];
    return items.filter((x) => x.type === "maps_search").map((row) => ({ provider: this.name, providerId: String(row.place_id ?? row.cid ?? ""), name: String(row.title ?? "Entreprise inconnue"), category: row.category, address: row.address, phone: row.phone, websiteUrl: row.url, rating: row.rating?.value, reviewCount: row.rating?.votes_count, latitude: row.latitude, longitude: row.longitude, sourceUrl: row.check_url, rawSource: row }));
  }
}
