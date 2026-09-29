import { config } from "../config.js";

export async function fetchLimited(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": config.USER_AGENT, accept: "text/html,application/xhtml+xml", ...init.headers }
    });
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > config.MAX_SITE_BYTES) throw new Error(`Response too large: ${length} bytes`);
    const reader = response.body?.getReader();
    if (!reader) return { response, body: "" };
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > config.MAX_SITE_BYTES) { await reader.cancel(); throw new Error("Response exceeded size limit"); }
      chunks.push(value);
    }
    return { response, body: new TextDecoder().decode(Buffer.concat(chunks)) };
  } finally { clearTimeout(timeout); }
}
