import type { Business, ScoreResult, WebsiteAnalysis } from "../domain.js";

const HIGH_VALUE = /electric|plomb|couvr|chauff|clim|menuis|toitur|renov/i;
const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));

export function scoreBusiness(business: Business, web?: WebsiteAnalysis): ScoreResult {
  const reasons: string[] = [];
  let businessScore = HIGH_VALUE.test(business.category ?? "") ? 18 : 12;
  if ((business.reviewCount ?? 0) >= 50) businessScore += 5;
  else if ((business.reviewCount ?? 0) >= 10) businessScore += 3;
  if ((business.rating ?? 0) >= 4.2) businessScore += 2;
  businessScore = clamp(businessScore, 25);

  let webOpportunity = 0;
  if (!business.websiteUrl) { webOpportunity = 35; reasons.push("Aucun site web détecté"); }
  else if (!web?.reachable) { webOpportunity = 32; reasons.push("Site inaccessible"); }
  else {
    if (!web.hasViewport) { webOpportunity += 7; reasons.push("Adaptation mobile insuffisante"); }
    if (!web.hasQuoteCta) { webOpportunity += 6; reasons.push("CTA de devis absent ou peu visible"); }
    if (!web.hasContactForm) webOpportunity += 5;
    if (!web.hasPhoneLink) webOpportunity += 4;
    if (!web.metaDescription) webOpportunity += 3;
    if (!web.hasSchemaOrg) webOpportunity += 3;
    if (!web.hasSitemap) webOpportunity += 2;
    if (web.wordCount < 250) webOpportunity += 3;
    if ((web.responseMs ?? 0) > 3000) { webOpportunity += 2; reasons.push("Réponse du site lente"); }
  }
  webOpportunity = clamp(webOpportunity, 35);

  let localScore = 7;
  if ((business.reviewCount ?? 0) >= 20) localScore += 5;
  if ((business.rating ?? 0) >= 4) localScore += 3;
  if (business.city) localScore += 2;
  if (web?.hasSchemaOrg) localScore += 2;
  if (web?.hasSocialLinks) localScore += 1;
  localScore = clamp(localScore, 20);

  let fitScore = HIGH_VALUE.test(business.category ?? "") ? 15 : 9;
  if (webOpportunity >= 20) fitScore += 3;
  if (business.phone || business.email) fitScore += 2;
  fitScore = clamp(fitScore, 20);

  const total = clamp(businessScore + webOpportunity + localScore + fitScore, 100);
  const offers: string[] = [];
  if (!business.websiteUrl || !web?.reachable || webOpportunity >= 25) offers.push("WEBSITE_ESSENTIAL");
  if (!web?.hasSchemaOrg || (business.reviewCount ?? 0) < 20) offers.push("GOOGLE_BUSINESS_OPTIMIZATION", "SEO_LOCAL");
  if (web?.reachable && (!web.hasQuoteCta || !web.hasContactForm)) offers.push("WEBSITE_CONVERSION_OPTIMIZATION");
  if ((business.reviewCount ?? 0) < 10) reasons.push("Preuve sociale locale à renforcer");
  const tier = total >= 90 ? "PRIORITAIRE" : total >= 80 ? "TRES_BON" : total >= 70 ? "BON" : total >= 60 ? "A_VERIFIER" : total >= 40 ? "FAIBLE" : "REJET";
  return { total, businessScore, webOpportunityScore: webOpportunity, localScore, fitScore, tier, recommendedOffers: [...new Set(offers)], reasons: [...new Set(reasons)], scoringVersion: "1.0.0" };
}
