import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mapOutput, exportProofFile, parseProofFile, verifyProofFile } from '@qentra/core';
const hash = (...parts) => createHash('sha256').update(Buffer.concat(parts)).digest();
const raw = x => Buffer.from(x, 'hex');
const input = { bytes: 32, mapping: { kind: 'pickUnique', items: ['Amber', 'Birch', 'Cedar'], count: 2 } };
const inputDigest = hash(Buffer.from(JSON.stringify(input))).toString('hex');
const providerContribution = '22'.repeat(32), userContribution = '33'.repeat(32);
const requestAddress = '11111111111111111111111111111111';
const outputBytes = hash(Buffer.from('qentra-solana-v1'), Buffer.alloc(32), raw(userContribution), raw(providerContribution), raw(inputDigest)).toString('hex');
const record = { schemaVersion: 4, id: `solana:fixture-network:${requestAddress}:2`, network: 'fixture-network', contract: requestAddress,
 sequence: '2', createdAt: '2026-10-22T00:00:00.000Z', input, inputDigest, state: 'fulfilled', verification: 'pending', delivery: 'not-requested',
 requester: requestAddress, recipient: requestAddress, feePaid: '0', feeQuoted: '500000', paymentVerified: false,
 userContribution, providerCommitment: hash(raw(providerContribution)).toString('hex'), numHashes: 1, providerContribution, outputBytes,
 mapping: await mapOutput(outputBytes, input.mapping), storage: 'events', requestAddress, callbackProgram: requestAddress, callbackAccount: requestAddress };
const json = await exportProofFile(record);
writeFileSync('draw-proof.json', json);
assert.deepEqual(await parseProofFile(json), record);
// Fresh recipient process has only core installed and denies network entrypoints.
writeFileSync('network-guard.mjs', `import { syncBuiltinESMExports } from 'node:module';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls';
const deny = () => { throw Error('Unexpected network operation'); };
globalThis.fetch = deny; http.request = http.get = https.request = https.get = deny;
net.connect = net.createConnection = tls.connect = deny; syncBuiltinESMExports();
`);
writeFileSync('recipient.mjs', `import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseProofFile, exportProofFile, verifyProofFile } from '@qentra/core';
const json = readFileSync('draw-proof.json', 'utf8'); const r = await parseProofFile(json);
assert.equal(await exportProofFile(r), json); const result = await verifyProofFile(r);
const cases = { digest: { inputDigest: '00'.repeat(32) }, reveal: { providerContribution: '11'.repeat(32) }, output: { outputBytes: 'ff'.repeat(32) }, mapping: { mapping: { ...r.mapping, result: ['Changed winner'] } } };
for (const [name, patch] of Object.entries(cases)) { const bad = {...r, ...patch}; await assert.rejects(() => parseProofFile(JSON.stringify(bad))); await assert.rejects(() => exportProofFile(bad)); await assert.rejects(() => verifyProofFile(bad)); }
assert.equal(r.paymentVerified, false); assert.equal(r.verification, 'pending');
writeFileSync('recipient-receipt.json', JSON.stringify({passed:true, freshProcess:true, installedPackage:'@qentra/core', walletCalls:0, paymentCalls:0, rpcCalls:0, networkGuard:true, tampered:Object.keys(cases), result},null,2));
`);
for (const script of ['recipient.mjs', 'node_modules/@qentra/core/examples/verify-proof.mjs']) {
 const result = spawnSync(process.execPath, ['--import', resolve('network-guard.mjs'), script, 'draw-proof.json'], { encoding: 'utf8' });
 assert.equal(result.status, 0, result.stdout + result.stderr);
}
const receipt = JSON.parse(readFileSync('recipient-receipt.json', 'utf8'));
assert.deepEqual(receipt.result.mapping, record.mapping);
assert.equal(receipt.result.outputBytes, outputBytes);
writeFileSync('core-proof-receipt.json', JSON.stringify(receipt,null,2));
console.log('Installed core-only fresh-process proof roundtrip + four tamper families passed');
