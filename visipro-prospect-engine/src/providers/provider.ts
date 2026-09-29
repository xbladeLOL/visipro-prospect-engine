import type { DiscoveredBusinessInput } from "../domain.js";
export interface DiscoveryQuery { query: string; city: string; countryCode: string; limit?: number; }
export interface DiscoveryProvider { readonly name: string; search(input: DiscoveryQuery): Promise<DiscoveredBusinessInput[]>; }
