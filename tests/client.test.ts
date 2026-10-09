import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QVRFClient, BrowserEntropyAdapter, MemoryRepository, validateRecord, type EntropyAdapter } from '../src/index.ts';
const deterministic: EntropyAdapter = {
  id: 'qentra-browser-v1', sourceMode: 'browser-cryptographic',
  request: async bytes => 'ab'.repeat(bytes),
};
test('lifecycle, mapping, unsubscribe and import reproduction compose', async () => {
  const client = new QVRFClient({ adapter: deterministic, repository: new MemoryRepository() });
  const request = await client.request({ bytes: 32 }); assert.equal(request.state, 'created');
  const updates: string[] = []; const unsubscribe = client.subscribe(request.id, r => updates.push(r.state));
  const result = await client.waitForResult(request.id); assert.equal(result.outputBytes, 'ab'.repeat(32));
  assert.deepEqual(updates, ['generating', 'produced']); unsubscribe();
  const mapped = await client.applyMapping(request.id, { kind: 'pickUnique', items: ['Amber', 'Birch', 'Cedar'], count: 2 });
  assert.deepEqual(updates, ['generating', 'produced']);
  assert.deepEqual(await validateRecord(JSON.parse(JSON.stringify(mapped))), mapped);
  assert.equal((await client.waitForResult(request.id)).state, 'produced');
});
test('adapter failure reaches terminal failure and rejects waits', async () => {
  const client = new QVRFClient({ adapter: { ...deterministic, request: async () => { throw Error('source unavailable'); } }, repository: new MemoryRepository() });
  const request = await client.request({ bytes: 16 });
  await assert.rejects(() => client.waitForResult(request.id), /source unavailable/);
  assert.equal((await client.getRequest(request.id))!.state, 'failed');
});
test('wait supports unknown IDs, pre-aborted and live-aborted cancellation', async () => {
  const client = new QVRFClient({ adapter: deterministic, repository: new MemoryRepository() });
  await assert.rejects(() => client.waitForResult('unknown'), /Unknown/);
  const pre = new AbortController(); pre.abort();
  await assert.rejects(() => client.waitForResult('unknown', { signal: pre.signal }), /aborted/);
  const stalled = new QVRFClient({ adapter: { ...deterministic, request: () => new Promise<string>(() => {}) }, repository: new MemoryRepository() });
  const request = await stalled.request({ bytes: 16 });
  await assert.rejects(() => stalled.waitForResult(request.id, { timeoutMs: 5 }), /timed out/);
  const live = new AbortController(); const waiting = stalled.waitForResult(request.id, { signal: live.signal }); live.abort();
  await assert.rejects(() => waiting, /aborted/);
});
test('storage failure retains result and mapping for export', async () => {
  const client = new QVRFClient({ adapter: deterministic, repository: {
    put: async () => { throw Error('storage unavailable'); }, get: async () => undefined, list: async () => [],
  } });
  const request = await client.request({ bytes: 32 });
  assert.ok((await client.waitForResult(request.id)).outputBytes); assert.ok(client.storageError);
  const mapped = await client.applyMapping(request.id, { kind: 'uniformInt', min: 1, max: 6 });
  assert.deepEqual(await validateRecord(mapped), mapped);
});
test('browser adapter and client enforce byte limits', async () => {
  const adapter = new BrowserEntropyAdapter();
  assert.equal((await adapter.request(16)).length, 32);
  for (const bytes of [0, 15, 4097, 16.5]) await assert.rejects(() => adapter.request(bytes));
  const client = new QVRFClient({ adapter, repository: new MemoryRepository() });
  await assert.rejects(() => client.request({ bytes: 15 }));
  await assert.rejects(() => client.applyMapping('unknown', { kind: 'uniformInt', min: 1, max: 6 }));
});
