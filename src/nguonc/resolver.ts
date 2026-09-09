import type { Fetcher } from "../nguonc.js";

export interface ResolvedStream { url: string; headers: Record<string, string>; }
export type StreamResolver = (embed: string) => Promise<ResolvedStream | undefined>;
const origin = "https://embed.streamc.xyz";
const referrer = "https://phim.nguonc.com/";
const userAgent = "Mozilla/5.0";

// Keep player-specific protocol changes here. Never execute upstream JavaScript.
export class NguonCResolver {
  private pending = new Map<string, Promise<ResolvedStream | undefined>>();
  constructor(private fetcher: Fetcher = fetch) {}

  resolve: StreamResolver = async embed => {
    let url: URL;
    try { url = new URL(embed); } catch { return undefined; }
    if (url.origin !== origin || url.pathname !== "/embed.php" || url.username || url.password ||
        !/^[a-f0-9]{32}$/.test(url.searchParams.get("hash") || "")) return undefined;
    const api = `${origin}/embed.php?hash=${url.searchParams.get("hash")}`;
    const existing = this.pending.get(api);
    if (existing) return existing;
    const work = this.issue(api).catch(() => undefined);
    this.pending.set(api, work);
    try { return await work; } finally { this.pending.delete(api); }
  };

  private async issue(api: string): Promise<ResolvedStream> {
    // One deadline covers bootstrap, token issuance and playlist validation.
    const signal = AbortSignal.timeout(12000);
    const headers = { "User-Agent": userAgent, Referer: api, Origin: origin };
    const post = async (body: object) => {
      const response = await this.fetcher(api, {
        method: "POST", redirect: "error", signal,
        headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Player HTTP ${response.status}`);
      return JSON.parse(await limitedText(response)) as Record<string, unknown>;
    };
    const frame_origins = [new URL(referrer).origin];
    const bootstrap = await post({ action: "bootstrap", referrer, frame_origins });
    if (bootstrap.api !== api || bootstrap.video !== new URL(api).searchParams.get("hash") ||
        typeof bootstrap.bootstrap !== "string" || !bootstrap.bootstrap ||
        bootstrap.turnstileEnabled !== false) throw new Error("Unsupported player bootstrap");
    // The site's native player requests plain HLS; AES-GCM manifests are not playable URLs.
    const issued = await post({ action: "issue", bootstrap: bootstrap.bootstrap, turnstile_response: "",
      playlist_format: "hls", pretty_url: true, path_chunks: true, frame_origins });
    if (typeof issued.playlist !== "string" || issued.playlistFormat !== "hls" ||
        !Number.isInteger(issued.issuedAt) || !Number.isInteger(issued.expiresAt) ||
        Number(issued.expiresAt) <= Math.max(Date.now() / 1000 + 30, Number(issued.issuedAt)) ||
        Number(issued.expiresAt) - Number(issued.issuedAt) > 86400) throw new Error("Invalid playback token");
    const playlist = new URL(issued.playlist);
    if (playlist.origin !== origin || playlist.username || playlist.password || playlist.hash)
      throw new Error("Invalid playlist origin");
    const response = await this.fetcher(playlist.href, { headers, signal, redirect: "error" });
    if (!response.ok) throw new Error(`Playlist HTTP ${response.status}`);
    const text = await limitedText(response);
    if (!/^#EXTM3U(?:\r?\n|$)/.test(text) || /#ENC-AESGCM|#EXT-X-B65/.test(text) ||
        !/#EXT(?:INF|-X-STREAM-INF):/.test(text)) throw new Error("Not a playable HLS playlist");
    return { url: playlist.href, headers: { "User-Agent": userAgent, Referer: api } };
  }
}

async function limitedText(response: Response): Promise<string> {
  if (!response.body) throw new Error("Empty player response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2 * 1024 * 1024) throw new Error("Player response too large");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { await reader.cancel(); reader.releaseLock(); }
}

export const resolveNguonCStream = new NguonCResolver().resolve;
