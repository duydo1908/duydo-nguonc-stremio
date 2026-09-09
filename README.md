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
- **Open in browser** choices when only an `embed` player URL is supplied.
- Five-minute bounded API caching, shared concurrent requests, and 15-second request timeouts.

## Source limitations

The live movie and series samples checked during development exposed only `embed` URLs. These are HTML player pages, so they are returned as Stremio `externalUrl` choices. They will open outside Stremio; they are not native playable stream URLs. The add-on does not extract hidden video URLs from player pages. Direct HLS handling is covered by fixture tests; end-to-end playback has not been verified in the Stremio app.

Titles use `nguonc:<slug>` identifiers. Streams appear on this add-on's own catalog/search results; they do not attach to Cinemeta/IMDb titles. The documented source endpoints do not provide an IMDb lookup.

NguonC commonly lists seasons as separate titles. Each title's episodes are displayed under season 1, retaining the upstream episode slug in its video ID. Individual episode air dates are omitted because the API does not supply them. Missing links, source outages, player restrictions, or expired upstream URLs can affect playback.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `7000` | Local listening port |
| `NGUONC_API_BASE` | `https://phim.nguonc.com/api` | Override the upstream API base |

Set variables in your shell or hosting settings. `.env` files are not loaded automatically.

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

The included Dockerfile and `render.yaml` support container deployment. Push the project to your repository, connect it to your hosting provider, and expose the service over HTTPS. Install the resulting `https://YOUR-HOST/manifest.json` URL in Stremio. No public deployment is created by running this project locally.

```bash
docker build -t stremio-nguonc .
docker run --rm -p 7000:7000 stremio-nguonc
```

Remote devices need a reachable hosted address; their `127.0.0.1` points to themselves. Use content you have permission to access.
