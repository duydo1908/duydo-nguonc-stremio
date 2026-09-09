export type MediaType = "movie" | "series";
export interface Episode {
  name: string;
  slug: string;
  m3u8?: string;
  embed?: string;
}
export interface Film {
  name: string;
  slug: string;
  original_name?: string;
  poster_url?: string;
  thumb_url?: string;
  description?: string;
  total_episodes?: number;
  current_episode?: string;
  year?: string;
  time?: string;
  quality?: string;
  language?: string;
  director?: string;
  casts?: string;
  category?: Record<
    string,
    { group: { name: string }; list: { name: string }[] }
  >;
  episodes?: { server_name: string; items: Episode[] }[];
}
interface Listing {
  status: string;
  items: Film[];
  paginate: { items_per_page: number; total_page: number };
}
export type Fetcher = typeof fetch;

export class NguonC {
  private cache = new Map<string, { expires: number; value: unknown }>();
  private pending = new Map<string, Promise<unknown>>();
  constructor(
    private base = process.env.NGUONC_API_BASE || "https://phim.nguonc.com/api",
    private fetcher: Fetcher = fetch,
  ) {}

  private async request<T>(path: string): Promise<T> {
    const cached = this.cache.get(path);
    if (cached && cached.expires > Date.now()) return cached.value as T;
    const pending = this.pending.get(path);
    if (pending) return pending as Promise<T>;
    const work = (async () => {
      const url = new URL(`${this.base.replace(/\/$/, "")}${path}`);
      const response = await this.fetcher(url.href, {
        signal: AbortSignal.timeout(15000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
          Accept: "application/json,text/plain,*/*",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
          Referer: "https://phim.nguonc.com/",
          Origin: "https://phim.nguonc.com",
        },
      });
      if (!response.ok) {
        // Record routing diagnostics without logging response bodies or credentials.
        const challenge = response.headers.get("cf-mitigated") === "challenge";
        await response.body?.cancel();
        throw new Error(
          `NguonC HTTP ${response.status} from ${url.origin}${url.pathname}` +
            (response.status === 403
              ? ": upstream denied access; request headers or hosting IP may be restricted"
              : "") +
            (challenge ? " (Cloudflare challenge)" : ""),
        );
      }
      const value = (await response.json()) as { status?: string };
      if (value.status !== "success")
        throw new Error("NguonC returned an unsuccessful response");
      if (this.cache.size >= 300)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(path, { expires: Date.now() + 300000, value });
      return value as T;
    })();
    this.pending.set(path, work);
    try {
      return await work;
    } finally {
      this.pending.delete(path);
    }
  }

  async film(slug: string): Promise<Film> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      throw new Error("Invalid film slug");
    const result = await this.request<{ movie: Film }>(`/film/${slug}`);
    if (!result.movie?.name || result.movie.slug !== slug)
      throw new Error("Invalid film response");
    return result.movie;
  }

  private async listing(path: string): Promise<Listing> {
    const result = await this.request<Listing>(path);
    if (
      !Array.isArray(result.items) ||
      !Number.isSafeInteger(result.paginate?.items_per_page) ||
      result.paginate.items_per_page < 1
    )
      throw new Error("Invalid catalog response");
    return result;
  }

  async catalog(type: MediaType, skip: number): Promise<Film[]> {
    const path = `/films/danh-sach/${type === "movie" ? "phim-le" : "phim-bo"}`;
    const first = await this.listing(`${path}?page=1`);
    const size = first.paginate.items_per_page;
    const page = Math.floor(skip / size) + 1;
    if (page > first.paginate.total_page) return [];
    const current =
      page === 1 ? first : await this.listing(`${path}?page=${page}`);
    let items = current.items.slice(skip % size);
    if (skip % size && page < first.paginate.total_page) {
      items = items
        .concat((await this.listing(`${path}?page=${page + 1}`)).items)
        .slice(0, size);
    }
    return items;
  }

  async search(keyword: string, type: MediaType): Promise<Film[]> {
    const result = await this.listing(
      `/films/search?keyword=${encodeURIComponent(keyword)}`,
    );
    // Detail categories distinguish one-episode series from films reliably.
    const films: Film[] = [];
    for (let i = 0; i < Math.min(result.items.length, 50); i += 5) {
      films.push(
        ...(await Promise.all(
          result.items.slice(i, i + 5).map((item) => this.film(item.slug)),
        )),
      );
    }
    return films.filter((film) => mediaType(film) === type);
  }
}

export const provider = new NguonC();
export function category(film: Film, group: string): string[] {
  return Object.values(film.category || {})
    .filter((c) => c.group.name === group)
    .flatMap((c) => c.list.map((item) => item.name));
}
export function mediaType(film: Film): MediaType {
  const formats = category(film, "Định dạng");
  if (formats.includes("Phim bộ")) return "series";
  if (formats.includes("Phim lẻ")) return "movie";
  return Number(film.total_episodes) > 1 ||
    /tập|hoàn tất/i.test(film.current_episode || "")
    ? "series"
    : "movie";
}
export function parseId(id: string) {
  const match =
    /^nguonc:([a-z0-9]+(?:-[a-z0-9]+)*)(?::episode:([a-z0-9-]+))?$/.exec(id);
  return match ? { slug: match[1], episode: match[2] } : null;
}
export function httpUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function episodes(film: Film): Episode[] {
  const unique = new Map<string, Episode>();
  for (const server of film.episodes || [])
    for (const episode of server.items || []) {
      if (/^[a-z0-9-]+$/.test(episode.slug) && !unique.has(episode.slug))
        unique.set(episode.slug, episode);
    }
  return [...unique.values()].sort((a, b) =>
    a.slug.localeCompare(b.slug, "en", { numeric: true }),
  );
}
export function toMeta(film: Film, type: MediaType, detailed = false) {
  const id = `nguonc:${film.slug}`;
  const names = (value?: string) =>
    value
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    id,
    type,
    name: film.name,
    poster: httpUrl(film.poster_url) || httpUrl(film.thumb_url),
    background: httpUrl(film.thumb_url),
    description: film.description
      ?.replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    genres: category(film, "Thể loại"),
    releaseInfo: film.year || category(film, "Năm")[0],
    director: names(film.director),
    cast: names(film.casts),
    runtime: film.time,
    ...(detailed && type === "movie"
      ? { behaviorHints: { defaultVideoId: id } }
      : {}),
    ...(detailed && type === "series"
      ? {
          videos: episodes(film).map((episode, index) => ({
            id: `${id}:episode:${episode.slug}`,
            title: /^\d+$/.test(episode.name)
              ? `Tập ${episode.name}`
              : episode.name,
            season: 1,
            episode: /^\d+$/.test(episode.name)
              ? Number(episode.name)
              : index + 1,
            available: true,
          })),
        }
      : {}),
  };
}
