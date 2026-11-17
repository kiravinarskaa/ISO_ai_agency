import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadCache } from '../read-cache.mjs';
test('concurrent reads share a request and expiry/invalidation reloads', async () => {
  let time = 0, calls = 0;
  const cache = createReadCache({ ttl: 30, now: () => time });
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all([cache.read('x', load), cache.read('x', load)]), [1, 1]);
  assert.equal(await cache.read('x', load), 1);
  time = 31;
  assert.equal(await cache.read('x', load), 2);
  cache.clear();
  assert.equal(await cache.read('x', load), 3);
});
test('quota errors pause requests and never become empty success', async () => {
  let time = 0, calls = 0;
  const cache = createReadCache({ cooldown: 65, now: () => time });
  const load = async () => { calls++; throw Object.assign(new Error('Quota exceeded'), { code: 429 }); };
  await assert.rejects(cache.read('x', load));
  cache.clear();
  await assert.rejects(cache.read('y', load));
  assert.equal(calls, 1);
  time = 66;
  assert.equal(await cache.read('y', async () => 'recovered'), 'recovered');
});
