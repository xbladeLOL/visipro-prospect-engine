import type { DiscoveryProvider, DiscoveryQuery } from "./provider.js";
export class MockProvider implements DiscoveryProvider {
  readonly name = "mock";
  async search(input: DiscoveryQuery) {
    return [{ provider: this.name, providerId: `demo-${input.query}-${input.city}`.toLowerCase(), name: `Entreprise Démo ${input.city}`, category: input.query, city: input.city, countryCode: input.countryCode, websiteUrl: "https://example.com", phone: "+33 2 38 00 00 00", rating: 4.4, reviewCount: 28, rawSource: { demo: true } }];
  }
}
