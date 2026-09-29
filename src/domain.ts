export interface DiscoveredBusinessInput {
  provider: string;
  providerId?: string;
  name: string;
  category?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  websiteUrl?: string;
  email?: string;
  rating?: number;
  reviewCount?: number;
  sourceUrl?: string;
  rawSource?: unknown;
}

export interface Business extends DiscoveredBusinessInput {
  id: string;
  normalizedName: string;
  normalizedPhone?: string;
  websiteDomain?: string;
  status: string;
}

export interface WebsiteAnalysis {
  finalUrl?: string;
  httpStatus?: number;
  reachable: boolean;
  responseMs?: number;
  tls: boolean;
  title?: string;
  metaDescription?: string;
  lang?: string;
  h1Count: number;
  hasViewport: boolean;
  hasCanonical: boolean;
  hasSchemaOrg: boolean;
  hasPhoneLink: boolean;
  hasEmailLink: boolean;
  hasContactForm: boolean;
  hasQuoteCta: boolean;
  hasSocialLinks: boolean;
  hasRobots: boolean;
  hasSitemap: boolean;
  copyrightYear?: number;
  wordCount: number;
  internalPagesChecked: number;
  brokenLinks: number;
  technologies: string[];
  issues: string[];
  facts: Record<string, unknown>;
}

export interface ScoreResult {
  total: number;
  businessScore: number;
  webOpportunityScore: number;
  localScore: number;
  fitScore: number;
  tier: string;
  recommendedOffers: string[];
  reasons: string[];
  scoringVersion: string;
}
