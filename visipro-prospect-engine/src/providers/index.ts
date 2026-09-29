import { config } from "../config.js";
import { DataForSeoProvider } from "./dataforseo.js";
import { MockProvider } from "./mock.js";
import type { DiscoveryProvider } from "./provider.js";
import { SerpApiProvider } from "./serpapi.js";
export function createProvider(): DiscoveryProvider {
  if (config.DISCOVERY_PROVIDER === "dataforseo") return new DataForSeoProvider();
  if (config.DISCOVERY_PROVIDER === "serpapi") return new SerpApiProvider();
  return new MockProvider();
}
