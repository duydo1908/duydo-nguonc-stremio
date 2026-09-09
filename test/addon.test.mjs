import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NguonC, parseId, toMeta } from '../dist/nguonc.js';
import { getStreams } from '../dist/streamProvider.js';
import { createAddon } from '../dist/addon.js';
const movie = { slug: 'test-film', name: 'Test Film', total_episodes: 1, current_episode: 'FULL', episodes: [{ server_name: 'Vietsub', items: [{ name: 'FULL', slug: 'tap-full', embed: 'https://example.com/player' }] }] };
const series = { slug: 'test-series', name: 'Test Series', total_episodes: 10, episodes: [
  { server_name: 'Vietsub', items: [
    { name: '10', slug: 'tap-10', m3u8: 'https://example.com/10.m3u8' },
    { name: '2', slug: 'tap-2', m3u8: 'https://example.com/2.m3u8', embed: 'https://example.com/player' },
  ] },
  { server_name: 'Dubbed', items: [{ name: '2', slug: 'tap-2', embed: 'https://example.com/dubbed' }] },
] };
function client(handler) { return new NguonC('https://api.example/api', async url => Response.json(handler(new URL(url)))); }
test('series videos share episode IDs across servers and sort numerically', () => {
  const meta = toMeta(series, 'series', true);
  assert.deepEqual(meta.videos.map(v => v.episode), [2, 10]);
  assert.deepEqual(meta.videos.map(v => v.id), ['nguonc:test-series:episode:tap-2', 'nguonc:test-series:episode:tap-10']);
});
test('returns only selected episode, prefers direct HLS, and retains browser fallback', async () => {
  const source = client(() => ({ status: 'success', movie: series }));
  const streams = await getStreams('series', 'nguonc:test-series:episode:tap-2', source);
  assert.equal(streams.length, 2);
  assert.equal(streams[0].url, 'https://example.com/2.m3u8');
  assert.equal(streams[0].externalUrl, undefined);
  assert.equal(streams[1].externalUrl, 'https://example.com/dubbed');
  assert.deepEqual(await getStreams('series', 'nguonc:test-series:episode:tap-3', source), []);
  assert.deepEqual(await getStreams('movie', 'nguonc:test-series', source), []);
});
test('embed-only movies expose externalUrl rather than a playable URL', async () => {
  const streams = await getStreams('movie', 'nguonc:test-film', client(() => ({ status: 'success', movie })));
  assert.equal(streams[0].externalUrl, 'https://example.com/player');
  assert.equal(streams[0].url, undefined);
});
test('invalid IDs never contact the provider', async () => {
  const source = client(() => { throw new Error('Unexpected fetch'); });
  for (const id of ['tt1234567', 'nguonc:../secret', 'nguonc:test-film:1:1']) {
    assert.equal(parseId(id), null);
    assert.deepEqual(await getStreams('movie', id, source), []);
  }
  assert.deepEqual(await getStreams('series', 'nguonc:test-series', source), []);
});
test('unsafe stream schemes are discarded', async () => {
  const film = { ...movie, episodes: [{ server_name: 'bad', items: [{ slug: 'tap-full', name: 'FULL', m3u8: 'javascript:alert(1)', embed: 'file:///tmp/a' }] }] };
  assert.deepEqual(await getStreams('movie', 'nguonc:test-film', client(() => ({ status: 'success', movie: film }))), []);
});
test('pagination honors source page size and nonaligned offsets', async () => {
  const source = client(url => ({ status: 'success', paginate: { items_per_page: 2, total_page: 3 }, items: [0, 1].map(i => ({ ...movie, slug: `film-${(Number(url.searchParams.get('page')) - 1) * 2 + i}` })) }));
  assert.deepEqual((await source.catalog('movie', 1)).map(f => f.slug), ['film-1', 'film-2']);
  assert.deepEqual(await source.catalog('movie', 6), []);
});
test('concurrent details share one fetch and failed requests can retry', async () => {
  let calls = 0;
  const source = client(() => { calls++; return { status: 'success', movie }; });
  await Promise.all([source.film('test-film'), source.film('test-film')]);
  await source.film('test-film');
  assert.equal(calls, 1);
  let tries = 0;
  const retry = new NguonC('https://api.example', async () => ++tries === 1 ? new Response('', { status: 503 }) : Response.json({ status: 'success', movie }));
  await assert.rejects(retry.film('test-film'), /503/);
  assert.equal((await retry.film('test-film')).slug, movie.slug);
});
test('search uses detail category for one-episode series and encodes keywords', async () => {
  const singleSeries = { ...series, total_episodes: 1, category: { 1: { group: { name: 'Định dạng' }, list: [{ name: 'Phim bộ' }] } } };
  const source = client(url => {
    if (url.pathname.endsWith('/search')) {
      assert.equal(url.searchParams.get('keyword'), 'hoa & flower');
      return { status: 'success', items: [movie, singleSeries], paginate: { items_per_page: 10, total_page: 1 } };
    }
    return { status: 'success', movie: url.pathname.endsWith(movie.slug) ? movie : singleSeries };
  });
  assert.deepEqual((await source.search('hoa & flower', 'series')).map(f => f.slug), ['test-series']);
});
test('SDK handlers return catalog, metadata and streams, and reject unsupported requests', async () => {
  const source = client(url => url.pathname.includes('/films/') ? { status: 'success', items: [movie], paginate: { items_per_page: 10, total_page: 1 } } : { status: 'success', movie });
  const addon = createAddon(source);
  assert.equal((await addon.get('catalog', 'movie', 'nguonc-movie')).metas[0].id, 'nguonc:test-film');
  assert.equal((await addon.get('meta', 'movie', 'nguonc:test-film')).meta.behaviorHints.defaultVideoId, 'nguonc:test-film');
  assert.equal((await addon.get('stream', 'movie', 'nguonc:test-film')).streams.length, 1);
  assert.deepEqual((await addon.get('catalog', 'movie', 'nguonc-movie', { skip: '-1' })).metas, []);
  assert.equal((await addon.get('meta', 'movie', 'tt123')).meta, null);
});
