import { config } from "../config.js";
import type { DiscoveredBusinessInput } from "../domain.js";
import type { DiscoveryProvider, DiscoveryQuery } from "./provider.js";

export class SerpApiProvider implements DiscoveryProvider {
  readonly name = "serpapi";
  async search(input: DiscoveryQuery): Promise<DiscoveredBusinessInput[]> {
    if (!config.SERPAPI_KEY) throw new Error("SERPAPI_KEY is missing");
    const params = new URLSearchParams({ engine: "google_maps", q: `${input.query} ${input.city}`, hl: "fr", gl: input.countryCode.toLowerCase(), api_key: config.SERPAPI_KEY });
    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!res.ok) throw new Error(`SerpApi returned ${res.status}`);
    const json = await res.json() as { local_results?: Record<string, unknown>[] };
    return (json.local_results ?? []).slice(0, input.limit ?? 50).map((row) => this.map(row));
  }
  private map(row: Record<string, unknown>): DiscoveredBusinessInput {
    const gps = row.gps_coordinates as Record<string, number> | undefined;
    return { provider: this.name, providerId: String(row.place_id ?? row.data_id ?? ""), name: String(row.title ?? "Entreprise inconnue"), category: String(row.type ?? ""), address: String(row.address ?? ""), phone: String(row.phone ?? ""), websiteUrl: String(row.website ?? ""), rating: typeof row.rating === "number" ? row.rating : undefined, reviewCount: typeof row.reviews === "number" ? row.reviews : undefined, latitude: gps?.latitude, longitude: gps?.longitude, sourceUrl: String(row.link ?? ""), rawSource: row };
  }
}
