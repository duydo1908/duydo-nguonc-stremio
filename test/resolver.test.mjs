import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NguonCResolver } from '../dist/nguonc/resolver.js';
import { getStreams } from '../dist/streamProvider.js';
const hash = 'a'.repeat(32);
const api = `https://embed.streamc.xyz/embed.php?hash=${hash}`;
const playlist = 'https://embed.streamc.xyz/conf.php?t=test';
function fixture(overrides = {}) {
  const calls = [];
  const resolver = new NguonCResolver(async (url, options) => {
    calls.push({ url, options });
    const body = options.body && JSON.parse(options.body);
    if (body?.action === 'bootstrap') return Response.json({ api, video: hash, bootstrap: 'token', turnstileEnabled: false, ...overrides.bootstrap });
    if (body?.action === 'issue') {
      assert.equal(body.playlist_format, 'hls');
      assert.equal(options.headers.Referer, api);
      const now = Math.floor(Date.now() / 1000);
      return Response.json({ playlist, playlistFormat: 'hls', issuedAt: now, expiresAt: now + 3600, ...overrides.issue });
    }
    return new Response(overrides.text ?? '#EXTM3U\n#EXTINF:10,\nhttps://cdn.example/segment.ts\n');
  });
  return { resolver, calls };
}
test('native HLS resolution shares concurrent requests and supplies playback headers', async () => {
  const { resolver, calls } = fixture();
  const [a, b] = await Promise.all([resolver.resolve(api), resolver.resolve(api)]);
  assert.equal(a.url, playlist);
  assert.deepEqual(a, b);
  assert.equal(a.headers.Referer, api);
  assert.equal(calls.length, 3);
  await resolver.resolve(api);
  assert.equal(calls.length, 6); // Tokens are freshly issued for new stream requests.
});
test('unknown hosts and unsafe embed URLs never trigger fetches', async () => {
  const { resolver, calls } = fixture();
  for (const url of ['http://127.0.0.1/embed.php', api.replace('https:', 'http:'), api.replace('embed.streamc.xyz', 'embed.streamc.xyz.evil.test'), api.replace('https://', 'https://user@'), 'invalid']) {
    assert.equal(await resolver.resolve(url), undefined);
  }
  assert.equal(calls.length, 0);
});
test('challenges, invalid tokens, foreign playlists, and encrypted or HTML responses fall back', async () => {
  for (const overrides of [
    { bootstrap: { turnstileEnabled: true } },
    { bootstrap: { video: 'wrong' } },
    { issue: { expiresAt: 1 } },
    { issue: { playlist: 'https://127.0.0.1/secret' } },
    { issue: { playlistFormat: 'aesgcm' } },
    { text: '#EXTM3U\n#ENC-AESGCM;iv=123\n#EXTINF:10,\nabc' },
    { text: '<html>Error</html>' },
    { text: 'x'.repeat(2 * 1024 * 1024 + 1) },
  ]) assert.equal(await fixture(overrides).resolver.resolve(api), undefined);
});
test('upstream failures are isolated and can retry', async () => {
  let calls = 0;
  const resolver = new NguonCResolver(async () => { calls++; throw new Error('network'); });
  assert.equal(await resolver.resolve(api), undefined);
  assert.equal(await resolver.resolve(api), undefined);
  assert.equal(calls, 2);
});
test('stream handler returns resolved URLs and preserves alternate-server fallback', async () => {
  const source = { film: async () => ({ slug: 'film', name: 'Film', total_episodes: 1, episodes: [
    { server_name: 'Vietsub', items: [{ slug: 'full', name: 'FULL', embed: api }] },
    { server_name: 'Dubbed', items: [{ slug: 'full', name: 'FULL', embed: 'https://other.example/player' }] },
  ] }) };
  const streams = await getStreams('movie', 'nguonc:film', source, fixture().resolver.resolve);
  assert.equal(streams[0].url, playlist);
  assert.equal(streams[0].behaviorHints.proxyHeaders.request.Referer, api);
  assert.equal(streams[1].externalUrl, 'https://other.example/player');
  const failed = await getStreams('movie', 'nguonc:film', source, async () => { throw new Error('changed player'); });
  assert.equal(failed[0].externalUrl, api);
});
