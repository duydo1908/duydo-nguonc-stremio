import { episodes, httpUrl, mediaType, parseId, provider, type NguonC } from "./nguonc.js";
import { resolveNguonCStream, type StreamResolver } from "./nguonc/resolver.js";
export interface StremioStream {
  name: string; title: string; url?: string; externalUrl?: string;
  behaviorHints?: { notWebReady: boolean; bingeGroup: string; proxyHeaders?: { request: Record<string, string> } };
}
export async function getStreams(type: string, id: string, source: NguonC = provider, resolve: StreamResolver = resolveNguonCStream): Promise<StremioStream[]> {
  const parsed = parseId(id);
  if (!parsed || !["movie", "series"].includes(type) || (type === "series" && !parsed.episode) || (type === "movie" && parsed.episode)) return [];
  const film = await source.film(parsed.slug);
  if (mediaType(film) !== type) return [];
  const selected = parsed.episode || episodes(film)[0]?.slug;
  const result: StremioStream[] = [];
  const seen = new Set<string>();
  for (const server of film.episodes || []) {
    for (const episode of server.items || []) {
      if (episode.slug !== selected) continue;
      let url = httpUrl(episode.m3u8);
      const externalUrl = httpUrl(episode.embed);
      const resolved = !url && externalUrl ? await resolve(externalUrl).catch(() => undefined) : undefined;
      url ||= httpUrl(resolved?.url);
      const target = url || externalUrl;
      if (!target || seen.has(`${server.server_name}:${target}`)) continue;
      seen.add(`${server.server_name}:${target}`);
      result.push({
        name: `NguonC · ${server.server_name}`,
        title: [film.quality, episode.name, url ? undefined : "Open in browser"].filter(Boolean).join(" · "),
        ...(url ? { url, behaviorHints: { notWebReady: true, bingeGroup: `nguonc-${parsed.slug}-${server.server_name}`,
          ...(resolved ? { proxyHeaders: { request: resolved.headers } } : {}),
        } } : { externalUrl }),
      });
    }
  }
  return result;
}
