import sdk from "stremio-addon-sdk";
import { mediaType, parseId, provider, toMeta, type MediaType, type NguonC } from "./nguonc.js";
import { getStreams } from "./streamProvider.js";

export const manifest = {
  id: "community.nguonc", version: "1.0.0", name: "NguonC",
  description: "Phim lẻ và phim bộ từ NguonC. Browse and search Vietnamese titles with HLS playback and browser fallback.",
  resources: ["catalog", "meta", "stream"], types: ["movie", "series"], idPrefixes: ["nguonc:"],
  catalogs: (["movie", "series"] as const).flatMap(type => [
    { type, id: `nguonc-${type}`, name: type === "movie" ? "NguonC — Phim lẻ" : "NguonC — Phim bộ", extra: [{ name: "skip" }] },
    { type, id: `nguonc-search-${type}`, name: "NguonC", extra: [{ name: "search", isRequired: true }] },
  ]),
};
interface Args { type: string; id: string; extra?: Record<string, string>; }
export function createAddon(source: NguonC = provider) {
  const builder = new sdk.addonBuilder(manifest);
  builder.defineCatalogHandler(async ({ type, id, extra = {} }: Args) => {
    if (type !== "movie" && type !== "series") return { metas: [] };
    try {
      let films;
      if (id === `nguonc-search-${type}`) {
        const keyword = extra.search?.trim();
        if (!keyword || keyword.length > 200) return { metas: [] };
        films = await source.search(keyword, type);
      } else if (id === `nguonc-${type}`) {
        const skip = Number(extra.skip || 0);
        if (!Number.isSafeInteger(skip) || skip < 0) return { metas: [] };
        films = await source.catalog(type, skip);
      } else return { metas: [] };
      return { metas: films.map(film => toMeta(film, type)), cacheMaxAge: 300 };
    } catch (error) { console.error("NguonC catalog:", error); return { metas: [], cacheMaxAge: 0 }; }
  });
  builder.defineMetaHandler(async ({ type, id }: Args) => {
    const parsed = parseId(id);
    if (!parsed || parsed.episode || !["movie", "series"].includes(type)) return { meta: null };
    try {
      const film = await source.film(parsed.slug);
      return { meta: mediaType(film) === type ? toMeta(film, type as MediaType, true) : null, cacheMaxAge: 300 };
    } catch (error) { console.error("NguonC metadata:", error); return { meta: null, cacheMaxAge: 0 }; }
  });
  builder.defineStreamHandler(async ({ type, id }: Args) => {
    try { return { streams: await getStreams(type, id, source), cacheMaxAge: 0 }; }
    catch (error) { console.error("NguonC streams:", error); return { streams: [], cacheMaxAge: 0 }; }
  });
  return builder.getInterface();
}
