import { db, transaction } from "../db.js";
import type { Business, DiscoveredBusinessInput, ScoreResult, WebsiteAnalysis } from "../domain.js";
import { normalizeName, normalizePhone, normalizeUrl } from "../lib/normalize.js";

function fromRow(row: any): Business {
  return { id: row.id, provider: row.provider, providerId: row.provider_id, name: row.name, normalizedName: row.normalized_name, category: row.category, address: row.address, postalCode: row.postal_code, city: row.city, countryCode: row.country_code, latitude: row.latitude, longitude: row.longitude, phone: row.phone, normalizedPhone: row.normalized_phone, websiteUrl: row.website_url, websiteDomain: row.website_domain, email: row.email, rating: row.rating == null ? undefined : Number(row.rating), reviewCount: row.review_count, sourceUrl: row.source_url, rawSource: row.raw_source, status: row.status };
}

export async function upsertBusiness(input: DiscoveredBusinessInput): Promise<{ business: Business; created: boolean }> {
  const normalizedName = normalizeName(input.name);
  const normalizedPhone = normalizePhone(input.phone);
  const { url, domain } = normalizeUrl(input.websiteUrl);
  return transaction(async (client) => {
    const suppressed = await client.query(`SELECT 1 FROM suppression_list WHERE (kind='DOMAIN' AND value=$1) OR (kind='PHONE' AND value=$2) OR (kind='PROVIDER_ID' AND value=$3) LIMIT 1`, [domain ?? "", normalizedPhone ?? "", input.providerId ?? ""]);
    const existing = await client.query(`SELECT * FROM discovered_businesses WHERE (provider=$1 AND provider_id=$2 AND $2 IS NOT NULL) OR (website_domain=$3 AND $3 IS NOT NULL) OR (normalized_phone=$4 AND $4 IS NOT NULL) ORDER BY created_at LIMIT 1 FOR UPDATE`, [input.provider, input.providerId || null, domain || null, normalizedPhone || null]);
    if (existing.rowCount) {
      const updated = await client.query(`UPDATE discovered_businesses SET last_seen_at=now(), updated_at=now(), rating=COALESCE($2,rating), review_count=COALESCE($3,review_count), website_url=COALESCE($4,website_url), website_domain=COALESCE($5,website_domain), raw_source=$6 WHERE id=$1 RETURNING *`, [existing.rows[0].id, input.rating, input.reviewCount, url, domain, JSON.stringify(input.rawSource ?? {})]);
      return { business: fromRow(updated.rows[0]), created: false };
    }
    const inserted = await client.query(`INSERT INTO discovered_businesses(provider,provider_id,name,normalized_name,category,address,postal_code,city,country_code,latitude,longitude,phone,normalized_phone,website_url,website_domain,email,rating,review_count,source_url,raw_source,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`, [input.provider, input.providerId || null, input.name, normalizedName, input.category, input.address, input.postalCode, input.city, input.countryCode ?? "FR", input.latitude, input.longitude, input.phone, normalizedPhone, url, domain, input.email, input.rating, input.reviewCount, input.sourceUrl, JSON.stringify(input.rawSource ?? {}), suppressed.rowCount ? "DO_NOT_CONTACT" : "DISCOVERED"]);
    return { business: fromRow(inserted.rows[0]), created: true };
  });
}

export async function getBusiness(id: string): Promise<Business | undefined> { const result = await db.query("SELECT * FROM discovered_businesses WHERE id=$1", [id]); return result.rowCount ? fromRow(result.rows[0]) : undefined; }
export async function listBusinesses(filters: { status?: string; minScore?: number; city?: string; limit: number; offset: number }) {
  const result = await db.query(`SELECT b.*, s.total, s.tier, s.recommended_offers FROM discovered_businesses b LEFT JOIN LATERAL (SELECT * FROM prospect_scores WHERE business_id=b.id ORDER BY created_at DESC LIMIT 1) s ON true WHERE ($1::text IS NULL OR b.status::text=$1) AND ($2::int IS NULL OR s.total >= $2) AND ($3::text IS NULL OR b.city ILIKE '%' || $3 || '%') ORDER BY s.total DESC NULLS LAST, b.discovered_at DESC LIMIT $4 OFFSET $5`, [filters.status ?? null, filters.minScore ?? null, filters.city ?? null, filters.limit, filters.offset]);
  return result.rows;
}
export async function saveAnalysis(businessId: string, a: WebsiteAnalysis) { await db.query(`INSERT INTO website_analyses(business_id,final_url,http_status,reachable,response_ms,tls,title,meta_description,lang,h1_count,has_viewport,has_canonical,has_schema_org,has_phone_link,has_email_link,has_contact_form,has_quote_cta,has_social_links,has_robots,has_sitemap,copyright_year,word_count,internal_pages_checked,broken_links,technologies,issues,facts) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`, [businessId,a.finalUrl,a.httpStatus,a.reachable,a.responseMs,a.tls,a.title,a.metaDescription,a.lang,a.h1Count,a.hasViewport,a.hasCanonical,a.hasSchemaOrg,a.hasPhoneLink,a.hasEmailLink,a.hasContactForm,a.hasQuoteCta,a.hasSocialLinks,a.hasRobots,a.hasSitemap,a.copyrightYear,a.wordCount,a.internalPagesChecked,a.brokenLinks,a.technologies,JSON.stringify(a.issues),JSON.stringify(a.facts)]); }
export async function saveScore(businessId: string, s: ScoreResult) { await db.query(`INSERT INTO prospect_scores(business_id,total,business_score,web_opportunity_score,local_score,fit_score,tier,recommended_offers,reasons,scoring_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [businessId,s.total,s.businessScore,s.webOpportunityScore,s.localScore,s.fitScore,s.tier,s.recommendedOffers,JSON.stringify(s.reasons),s.scoringVersion]); await db.query("UPDATE discovered_businesses SET status='REVIEW',last_analyzed_at=now(),updated_at=now() WHERE id=$1", [businessId]); }
