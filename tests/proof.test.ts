import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportProofFile, parseProofFile, verifyProofFile } from '../src/proof.js';
import { proofFixture } from './proof-fixture.js';
import type { ProtocolRecord } from '../src/solana.js';
import type { MappingConfig } from '@qentra/core';

test('fulfilled tournament and allocation files round-trip without trusting saved flags', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('Unexpected network'); };
  try {
    for (const config of [
      { kind: 'pickUnique', items: ['Amber', 'Birch', 'Cedar'], count: 1 },
      { kind: 'shuffle', items: ['Amber', 'Birch', 'Cedar'] },
      { kind: 'weightedPick', items: ['Amber', 'Birch', 'Cedar'], weights: [1, 2, 3] },
      { kind: 'uniformInt', min: 1, max: 100 }
    ] as MappingConfig[]) {
      const record = await proofFixture(config), json = await exportProofFile(record);
      assert.equal(json, await exportProofFile(record));
      const parsed = await parseProofFile(json);
      assert.deepEqual(parsed, record);
      assert.equal(parsed.verification, 'pending');
      assert.equal(parsed.paymentVerified, false);
      const receipt = await verifyProofFile(parsed);
      assert.equal(receipt.scope, 'offline-content-integrity');
      assert.deepEqual(receipt.mapping, record.mapping);
      assert.equal(await exportProofFile(parsed), json);
    }
  } finally { globalThis.fetch = original; }
});

test('changed winner, fixed inputs, reveal and output fail on import and export', async () => {
  const record = await proofFixture();
  const mutations: [Partial<ProtocolRecord>, RegExp][] = [
    [{ mapping: { ...record.mapping!, result: ['Changed winner'] } }, /Application result/],
    [{ input: { ...record.input, serviceQuote: 'changed' } }, /Fixed inputs/],
    [{ providerContribution: '11'.repeat(32) }, /commitment/],
    [{ outputBytes: 'ff'.repeat(32) }, /Output/]
  ];
  for (const [patch, message] of mutations) {
    const changed = { ...record, ...patch };
    await assert.rejects(() => parseProofFile(JSON.stringify(changed)), message);
    await assert.rejects(() => exportProofFile(changed), message);
  }
});

test('malformed files and missing/invalid schema fields have useful errors', async () => {
  await assert.rejects(() => parseProofFile('{'), /malformed JSON/);
  for (const value of [null, [], 'record']) await assert.rejects(() => parseProofFile(JSON.stringify(value)), /expected an object/);
  const record = await proofFixture();
  for (const [field, value] of [
    ['schemaVersion', 1], ['state', 'requested'], ['input', null], ['mapping', null], ['numHashes', 0],
    ['outputBytes', 'oops'], ['requestAddress', 'invalid'], ['feeQuoted', 5], ['paymentVerified', 'true'], ['id', 'another']
  ]) await assert.rejects(() => parseProofFile(JSON.stringify({ ...record, [field as string]: value })), new RegExp(String(field)));
  const missing = { ...record } as any; delete missing.providerContribution;
  await assert.rejects(() => parseProofFile(JSON.stringify(missing)), /providerContribution/);
  await assert.rejects(() => verifyProofFile({ ...record, input: { ...record.input, mapping: { kind: 'weightedPick' } } }), /input.mapping.items/);
  await assert.rejects(() => verifyProofFile({ ...record, input: { ...record.input, mapping: { kind: 'uniformInt', min: 10, max: 1 } } }), /Fixed inputs/);
});

test('export snapshots caller data before asynchronous verification', async () => {
  const record = await proofFixture();
  const pending = exportProofFile(record);
  record.mapping!.result = ['Changed after export started'];
  const restored = await parseProofFile(await pending);
  assert.notDeepEqual(restored.mapping, record.mapping);
});
