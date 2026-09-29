import { config } from "../config.js";
import type { DiscoveredBusinessInput } from "../domain.js";
import type { DiscoveryProvider, DiscoveryQuery } from "./provider.js";

export class SerpApiProvider implements DiscoveryProvider {
  readonly name = "serpapi";
  async search(input: DiscoveryQuery): Promise<DiscoveredBusinessInput[]> {
    if (!config.SERPAPI_KEY) throw new Error("SERPAPI_KEY is missing");
    const params = new URLSearchParams({ engine: "google_maps", q: `${input.query} ${input.city}`, hl: "fr", gl: input.countryCode.toLowerCase(), api_key: config.SERPAPI_KEY });
    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!res.ok) {
      let detail="";
      try { const body=await res.json() as {error?:string}; detail=body.error ? `: ${body.error}` : ""; } catch { /* réponse non JSON */ }
      throw new Error(`SerpApi returned ${res.status}${detail}`);
    }
    const json = await res.json() as { local_results?: Record<string, unknown>[] };
    return (json.local_results ?? []).slice(0, input.limit ?? 50).map((row) => this.map(row, input.city));
  }
  private map(row: Record<string, unknown>, fallbackCity: string): DiscoveredBusinessInput {
    const gps = row.gps_coordinates as Record<string, number> | undefined;
    const address=String(row.address ?? "");
    const postalMatch=address.match(/\b(\d{5})\b/);
    const cityFromAddress=postalMatch ? address.slice((postalMatch.index??0)+postalMatch[0].length).split(",")[0]?.trim() : undefined;
    const placeId=String(row.place_id ?? ""); const dataCid=String(row.data_cid ?? "");
    const googleMapsUrl=dataCid ? `https://www.google.com/maps?cid=${encodeURIComponent(dataCid)}` : placeId ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(row.title??fallbackCity))}&query_place_id=${encodeURIComponent(placeId)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.title??""} ${address||fallbackCity}`)}`;
    const links=row.links as Record<string,string>|undefined;
    return { provider: this.name, providerId: String(row.place_id ?? row.data_id ?? row.data_cid ?? ""), name: String(row.title ?? "Entreprise inconnue"), category: String(row.type ?? ""), address, postalCode: postalMatch?.[1], city: cityFromAddress || fallbackCity, countryCode:"FR", phone: String(row.phone ?? ""), websiteUrl: String(row.website ?? links?.website ?? ""), rating: typeof row.rating === "number" ? row.rating : undefined, reviewCount: typeof row.reviews === "number" ? row.reviews : undefined, latitude: gps?.latitude, longitude: gps?.longitude, sourceUrl: googleMapsUrl, rawSource: row };
  }
}
