import * as cheerio from "cheerio";
import * as robotsParserModule from "robots-parser";
import { config } from "../config.js";
import { fetchLimited } from "../lib/http.js";
import type { WebsiteAnalysis } from "../domain.js";

const QUOTE_WORDS = /\b(devis|estimation|tarif|contactez|rappel)\b/i;
const SOCIAL = /facebook\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com/i;

function detectTechnologies(headers: Headers, html: string): string[] {
  const out = new Set<string>();
  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1];
  if (generator) out.add(generator.split(" ").slice(0, 2).join(" "));
  if (/wp-content|wordpress/i.test(html)) out.add("WordPress");
  if (/elementor/i.test(html)) out.add("Elementor");
  if (/wixstatic|wix\.com/i.test(html)) out.add("Wix");
  if (/webflow/i.test(html)) out.add("Webflow");
  if (/_next\/static|__NEXT_DATA__/i.test(html)) out.add("Next.js");
  if (/shopify/i.test(html)) out.add("Shopify");
  const server = headers.get("server"); if (server) out.add(server.split("/")[0] ?? server);
  return [...out].slice(0, 10);
}

async function exists(url: URL, path: string): Promise<boolean> {
  try { const res = await fetch(new URL(path, url), { method: "HEAD", redirect: "follow" }); return res.ok; } catch { return false; }
}

export async function analyzeSite(rawUrl: string): Promise<WebsiteAnalysis> {
  const started = Date.now();
  const issues: string[] = [];
  try {
    const requestedUrl = new URL(rawUrl);
    try {
      const robotsUrl = new URL("/robots.txt", requestedUrl).toString();
      const robotsResponse = await fetchLimited(robotsUrl);
      if (robotsResponse.response.ok) {
        const parseRobots = ((robotsParserModule as unknown as { default?: unknown }).default ?? robotsParserModule) as unknown as (url: string, content: string) => { isAllowed(url: string, userAgent?: string): boolean | undefined };
        const robots = parseRobots(robotsUrl, robotsResponse.body);
        if (!robots.isAllowed(requestedUrl.toString(), config.USER_AGENT)) throw new Error("Analyse interdite par robots.txt");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("interdite par robots.txt")) throw error;
    }
    const { response, body } = await fetchLimited(rawUrl);
    const finalUrl = new URL(response.url);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) throw new Error(`Unsupported content type: ${contentType}`);
    const $ = cheerio.load(body);
    $("script,style,noscript,svg").remove();
    const title = $("title").first().text().trim();
    const metaDescription = $('meta[name="description"]').attr("content")?.trim();
    const visibleText = $("body").text().replace(/\s+/g, " ").trim();
    const h1Count = $("h1").length;
    const hasViewport = $('meta[name="viewport"]').length > 0;
    const hasCanonical = $('link[rel="canonical"]').length > 0;
    const hasSchemaOrg = $('script[type="application/ld+json"]').length > 0 || /schema\.org/i.test(body);
    const hasPhoneLink = $('a[href^="tel:"]').length > 0;
    const hasEmailLink = $('a[href^="mailto:"]').length > 0;
    const hasContactForm = $("form").length > 0 && $("form input, form textarea").length > 0;
    const hasQuoteCta = $("a,button").toArray().some((el) => QUOTE_WORDS.test($(el).text()));
    const hasSocialLinks = $("a[href]").toArray().some((el) => SOCIAL.test($(el).attr("href") ?? ""));
    const yearMatches = [...visibleText.matchAll(/(?:©|copyright)?\s*(20\d{2})/gi)].map((m) => Number(m[1]));
    const copyrightYear = yearMatches.length ? Math.max(...yearMatches) : undefined;
    if (!title) issues.push("Titre de page absent");
    if (!metaDescription) issues.push("Meta description absente");
    if (h1Count !== 1) issues.push(h1Count === 0 ? "Titre H1 absent" : "Plusieurs titres H1");
    if (!hasViewport) issues.push("Viewport mobile absent");
    if (!hasPhoneLink) issues.push("Numéro de téléphone non cliquable");
    if (!hasContactForm) issues.push("Aucun formulaire de contact détecté");
    if (!hasQuoteCta) issues.push("CTA de devis peu visible ou absent");
    if (copyrightYear && copyrightYear < new Date().getFullYear() - 2) issues.push(`Copyright ancien (${copyrightYear})`);
    const [hasRobots, hasSitemap] = await Promise.all([exists(finalUrl, "/robots.txt"), exists(finalUrl, "/sitemap.xml")]);
    return { finalUrl: response.url, httpStatus: response.status, reachable: response.ok, responseMs: Date.now() - started, tls: finalUrl.protocol === "https:", title: title || undefined, metaDescription, lang: $("html").attr("lang"), h1Count, hasViewport, hasCanonical, hasSchemaOrg, hasPhoneLink, hasEmailLink, hasContactForm, hasQuoteCta, hasSocialLinks, hasRobots, hasSitemap, copyrightYear, wordCount: visibleText.split(/\s+/).filter(Boolean).length, internalPagesChecked: 1, brokenLinks: 0, technologies: detectTechnologies(response.headers, body), issues, facts: { contentBytes: Buffer.byteLength(body), contentType } };
  } catch (error) {
    return { reachable: false, responseMs: Date.now() - started, tls: rawUrl.startsWith("https:"), h1Count: 0, hasViewport: false, hasCanonical: false, hasSchemaOrg: false, hasPhoneLink: false, hasEmailLink: false, hasContactForm: false, hasQuoteCta: false, hasSocialLinks: false, hasRobots: false, hasSitemap: false, wordCount: 0, internalPagesChecked: 0, brokenLinks: 0, technologies: [], issues: [`Site inaccessible: ${error instanceof Error ? error.message : String(error)}`], facts: {} };
  }
}
