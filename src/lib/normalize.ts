export function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(sarl|sas|sasu|eurl|ei|sa|ets|etablissement)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizePhone(value?: string): string | undefined {
  if (!value) return undefined;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("33") && digits.length === 11) digits = `0${digits.slice(2)}`;
  return digits.length >= 9 ? digits : undefined;
}

export function normalizeUrl(value?: string): { url?: string; domain?: string } {
  if (!value) return {};
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(candidate);
    url.hash = "";
    const domain = url.hostname.toLowerCase().replace(/^www\./, "");
    return { url: url.toString(), domain };
  } catch { return {}; }
}
