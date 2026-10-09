import assert from 'node:assert/strict';
import { QVRFClient, BrowserEntropyAdapter, MemoryRepository, validateRecord } from '../src/index.ts';
const client = new QVRFClient({ adapter: new BrowserEntropyAdapter(), repository: new MemoryRepository() });
const request = await client.request({ bytes: 32 });
const updates: string[] = [];
const unsubscribe = client.subscribe(request.id, record => updates.push(record.state));
try {
  await client.waitForResult(request.id, { timeoutMs: 10000 });
  const mapped = await client.applyMapping(request.id, {
    kind: 'pickUnique', items: ['Amber', 'Birch', 'Cedar', 'Dune'], count: 2,
  });
  const exported = JSON.stringify(mapped);
  assert.deepEqual(await validateRecord(JSON.parse(exported)), mapped);
  console.log(JSON.stringify({ requestId: mapped.id, selected: mapped.mapping!.result, updates, reproduced: true }));
} finally { unsubscribe(); }
