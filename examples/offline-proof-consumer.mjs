// Installed-package proof recipients: synthetic tournament/allocation records.
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mapOutput, exportProofFile, parseProofFile, verifyProofFile } from '@qentra/sdk';
import { parseProofFile as parseFromSubpath } from '@qentra/sdk/proof';
import { hash, hex, bytes, pub, SYSTEM_PROGRAM } from '@qentra/sdk/solana';
const enc = new TextEncoder(), program = 'CcoAe9c5yenzozkSqdiJAmaCeoZTiSSV5urBUnC1oa8d';
const guard = resolve('offline-guard.mjs');
await writeFile(guard, `
import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';import dns from 'node:dns';import dgram from 'node:dgram';
import {syncBuiltinESMExports} from 'node:module';
let attempts=0;const deny=()=>{attempts++;throw Error('Offline network forbidden');};
globalThis.fetch=deny;globalThis.WebSocket=deny;
for(const [module,names] of [[http,['request','get']],[https,['request','get']],[net,['connect','createConnection']],[tls,['connect']],[dns,['lookup','resolve']],[dgram,['createSocket']]])for(const name of names)module[name]=deny;
net.Socket.prototype.connect=deny;for(const name of ['lookup','resolve'])dns.promises[name]=deny;
syncBuiltinESMExports();process.on('exit',()=>{if(attempts){process.stderr.write('Network attempt detected');process.exitCode=93;}});
`);
let calls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { calls++; throw Error('Offline SDK attempted network'); };
const checks = [];
function cli(file, expected, label, args = ['verify', file]) {
  const result = spawnSync(resolve('node_modules/.bin/qentra-proof'), args, {
    encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: `--experimental-permission --allow-fs-read=* --import=${guard}` }
  });
  assert.ifError(result.error);assert.equal(result.status, expected, result.stderr);
  if (expected === 0 && args[0] === 'verify') {
    const receipt = JSON.parse(result.stdout);assert.equal(receipt.scope, 'offline-content-integrity');
    checks.push({ name: label, exitCode: result.status, receipt });
    return receipt;
  }
  if (expected !== 0) {assert.equal(result.stdout, '');assert.match(result.stderr, /qentra-proof|Usage:/);}
  checks.push({ name: label, exitCode: result.status });
}
try {
  for (const [name, mapping] of [
    ['tournament', { kind: 'pickUnique', items: ['Amber', 'Birch', 'Cedar'], count: 1 }],
    ['allocation', { kind: 'shuffle', items: ['Amber', 'Birch', 'Cedar'] }],
    ['weighted', { kind: 'weightedPick', items: ['Amber', 'Birch', 'Cedar'], weights: [1, 2, 3] }]
  ]) {
    const input = { bytes: 32, mapping, serviceQuote: 'fixture-quote' };
    const inputDigest = hex(await hash(enc.encode(JSON.stringify(input))));
    const providerContribution = '22'.repeat(32), userContribution = '33'.repeat(32), requestAddress = SYSTEM_PROGRAM;
    const outputBytes = hex(await hash(enc.encode('qentra-solana-v1'), pub(requestAddress), bytes(userContribution), bytes(providerContribution), bytes(inputDigest)));
    const record = { schemaVersion: 4, id: `solana:fixture-network:${program}:2`, network: 'fixture-network', contract: program, sequence: '2',
      createdAt: '2026-10-22T00:00:00.000Z', input, inputDigest, state: 'fulfilled', verification: 'pending', delivery: 'not-requested',
      requester: SYSTEM_PROGRAM, recipient: SYSTEM_PROGRAM, feePaid: '0', feeQuoted: '500000', paymentVerified: false,
      userContribution, providerContribution, providerCommitment: hex(await hash(bytes(providerContribution))), numHashes: 1,
      outputBytes, mapping: await mapOutput(outputBytes, mapping), storage: 'events', requestAddress, callbackProgram: SYSTEM_PROGRAM, callbackAccount: SYSTEM_PROGRAM };
    const file = `${name}.json`, saved = await exportProofFile(record);
    assert.equal(saved, await exportProofFile(record));
    await writeFile(file, saved);
    const reopened = await parseProofFile(await readFile(file, 'utf8'));
    assert.deepEqual(reopened, record);assert.deepEqual(await parseFromSubpath(saved), record);
    const summary = await verifyProofFile(reopened), receipt = cli(file, 0, `${name} installed offline CLI`);
    assert.deepEqual(receipt, summary);
    for (const [suffix, patch] of [
      ['winner', { mapping: { ...record.mapping, result: 'Changed winner' } }],
      ['inputs', { input: { ...record.input, serviceQuote: 'changed' } }],
      ['output', { outputBytes: 'ff'.repeat(32) }],
      ['reveal', { providerContribution: '11'.repeat(32) }]
    ]) {
      const changed = { ...record, ...patch }, changedFile = `${name}-${suffix}.json`;
      await writeFile(changedFile, JSON.stringify(changed));
      await assert.rejects(() => parseProofFile(JSON.stringify(changed)));
      cli(changedFile, 1, `${name} changed ${suffix} rejected`);
    }
  }
  for (const [name, value] of [['truncated', '{'], ['null', 'null'], ['array', '[]'], ['schema', '{"schemaVersion":1}']]) {
    await writeFile(`${name}.json`, value);cli(`${name}.json`, 1, `${name} malformed rejected`);
  }
  cli('missing.json', 1, 'missing file rejected');cli('', 2, 'missing argument rejected', ['verify']);
  cli('', 2, 'RPC option rejected', ['verify', 'tournament.json', '--rpc', 'https://example.invalid']);
  cli('', 0, 'help', ['--help']);
  assert.equal(calls, 0);
  await writeFile('offline-proof-receipt.json', JSON.stringify({ scope: 'synthetic installed offline proof-file journey', passed: true,
    noWallet: true, noPayment: true, sdkNetworkCalls: calls, cliNetworkGuard: true, cliFilesystemReadOnly: true, checks }, null, 2) + '\n');
  console.log(JSON.stringify({ offlineProofFileConsumer: true, checks: checks.length, passed: true, sdkNetworkCalls: calls }));
} finally { globalThis.fetch = originalFetch; }
