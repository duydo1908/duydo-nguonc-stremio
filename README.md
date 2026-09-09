# NguonC for Stremio

A TypeScript add-on using the [NguonC API](https://phim.nguonc.com/api-document) and the [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk).

## Run and install locally

Requires Node.js 20+.

```bash
npm ci
npm run build
npm start
```

In Stremio's add-on installation field, paste:

```text
http://127.0.0.1:7000/manifest.json
```

Use Stremio desktop on the same computer for the simplest local setup. Look for **NguonC — Phim lẻ** and **NguonC — Phim bộ** in Discover, or search for a Vietnamese/original title and choose a NguonC result. Open the title, choose an episode for a series, and select a source.

For development, use `npm run dev`. Run `npm test` for the build and automated provider/handler tests.

## What works

- Separate movie and series catalogs with pagination.
- Title search (first upstream search page, separated by movie/series).
- Posters, descriptions, genres, cast and directors where supplied.
- Series episode lists with alternate language/server choices.
- Direct HLS playback when an episode includes `m3u8`.
- Native HLS resolution for supported `embed.streamc.xyz` players through their bootstrap and playback-token endpoints.
- **Open in browser** fallback for unsupported players, failed resolution, or verification requirements.
- Five-minute bounded API caching, shared concurrent requests, and 15-second request timeouts.

## Source limitations

The resolver lives in `src/nguonc/resolver.ts`. The player inspected on September 9, 2026 uses `bootstrap` followed by `issue`, with `playlist_format: "hls"` for native playback. This yields a plain HLS playlist without decrypting the AES-GCM format used by its JavaScript player. The resolver validates the returned playlist before exposing it to Stremio and supplies playback request headers through `behaviorHints.proxyHeaders`. It does not execute player scripts. Unknown hosts and players requiring interactive verification fall back to browser links.

Live verification retrieved a plain playlist and a 1 KB segment sample using curl. However, Node's HTTP clients received Cloudflare HTTP 403 from the same bootstrap endpoint on this machine, so the implemented resolver fell back to the browser during its live smoke test. Native playback is therefore conditional on upstream acceptance of requests from your deployment; it is not confirmed working end to end in Stremio. Automated tests cover successful resolution, invalid/encrypted responses, failures, and browser fallback.

Stream responses use `cacheMaxAge: 0` to avoid reusing expiring playback tokens. Concurrent resolutions for the same embed share a request, with a 12-second deadline per resolution and a 2 MB response limit. Player URLs are restricted to the observed HTTPS host and redirects are rejected. Future player protocol or host changes should be handled in the resolver module.

Titles use `nguonc:<slug>` identifiers. Streams appear on this add-on's own catalog/search results; they do not attach to Cinemeta/IMDb titles. The documented source endpoints do not provide an IMDb lookup.

NguonC commonly lists seasons as separate titles. Each title's episodes are displayed under season 1, retaining the upstream episode slug in its video ID. Individual episode air dates are omitted because the API does not supply them. Missing links, source outages, player restrictions, or expired upstream URLs can affect playback.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `7000` | Local listening port |
| `NGUONC_API_BASE` | `https://phim.nguonc.com/api` | Override the upstream API base |

Set variables in your shell or hosting settings. `.env` files are not loaded automatically.

## Empty catalogs on a hosted service

If Render logs show `NguonC HTTP 403`, the upstream API denied the hosting server's request. API requests include a User-Agent and a Referer matching the configured API origin for compatibility, but these headers do not guarantee access from a hosting provider. Deploy the updated code and check the catalog again. A persistent 403 requires investigating upstream access restrictions; changing Stremio's installation will not fix that denial. The same add-on can be run locally using the instructions above to compare access from your own network.

Check that `NGUONC_API_BASE` is unset or points to the intended API (the default is `https://phim.nguonc.com/api`). Failed requests are not cached. Logs identify the upstream host/path and flag explicit Cloudflare challenge responses without recording response bodies.

## Example requests

```bash
curl 'http://127.0.0.1:7000/manifest.json'
curl 'http://127.0.0.1:7000/catalog/movie/nguonc-movie.json'
curl 'http://127.0.0.1:7000/catalog/series/nguonc-series/skip=10.json'
curl 'http://127.0.0.1:7000/catalog/series/nguonc-search-series/search=hoa%20thien%20cot.json'
curl 'http://127.0.0.1:7000/meta/series/nguonc:hoa-thien-cot.json'
curl 'http://127.0.0.1:7000/stream/series/nguonc:hoa-thien-cot:episode:tap-1.json'
```

## Deploy

### Railway

The included `railway.json` builds the existing Dockerfile and checks `/manifest.json` before marking the deployment ready. No database or persistent volume is needed.

1. Push this project, including `railway.json`, to your GitHub repository.
2. In [Railway](https://railway.com/new), create a project from a GitHub repository and select `duydo1908/duydo-nguonc-stremio` (or your fork).
3. Use the repository root as the service root. Railway uses the Dockerfile's build and start commands; leave command overrides empty.
4. In service **Variables**, set `PORT=7000`. Leave `NGUONC_API_BASE` unset to use the default source API.
5. After deployment succeeds, open **Settings → Networking → Public Networking → Generate Domain**. Use target port `7000` if prompted.
6. Open `https://YOUR-HOST/manifest.json` and `https://YOUR-HOST/catalog/movie/nguonc-movie.json`. The manifest should contain add-on metadata, and the catalog should contain a nonempty `metas` array. If the catalog is empty, inspect the deployment logs for upstream errors.
7. Paste `https://YOUR-HOST/manifest.json` into Stremio's add-on installation field. Test a title and its sources before retiring the old Render service.

Railway's [pricing](https://docs.railway.com/pricing/plans) currently includes a limited Free plan with $1 monthly credit and a Hobby plan starting at $5/month, with $5 of usage included. Additional usage costs extra; free credit does not guarantee a full month of hosting. Check the current plan and usage limits before enabling billing.

The manifest healthcheck confirms that the add-on is running; it does not verify NguonC access or playback. A different host may still receive upstream HTTP 403 responses. Confirm catalog and playback behavior on the deployed service before treating the migration as successful.

See Railway's [Dockerfile guide](https://docs.railway.com/builds/dockerfiles), [configuration reference](https://docs.railway.com/config-as-code/reference), and [public networking guide](https://docs.railway.com/networking/public-networking).

### Other container hosts

The included Dockerfile supports other container hosts; `render.yaml` is retained for Render. Expose the service over HTTPS and install `https://YOUR-HOST/manifest.json` in Stremio. No public deployment is created by running this project locally.

```bash
docker build -t stremio-nguonc .
docker run --rm -p 7000:7000 stremio-nguonc
```

Remote devices need a reachable hosted address; their `127.0.0.1` points to themselves. Use content you have permission to access.
