import { hex, hash, bytes, pub, SYSTEM_PROGRAM, type ProtocolInput, type ProtocolRecord } from '../src/solana.js';
import { mapOutput, type MappingConfig } from '@qentra/core';

// Synthetic content-integrity fixture, never a live/source-provenance receipt.
export async function proofFixture(mapping: MappingConfig = { kind: 'pickUnique', items: ['Amber', 'Birch', 'Cedar'], count: 1 }): Promise<ProtocolRecord> {
  const enc = new TextEncoder();
  const program = 'CcoAe9c5yenzozkSqdiJAmaCeoZTiSSV5urBUnC1oa8d';
  const input: ProtocolInput = { bytes: 32, mapping, serviceQuote: 'fixture-quote' };
  const inputDigest = hex(await hash(enc.encode(JSON.stringify(input))));
  const providerContribution = '22'.repeat(32), userContribution = '33'.repeat(32);
  const providerCommitment = hex(await hash(bytes(providerContribution)));
  const requestAddress = SYSTEM_PROGRAM;
  const outputBytes = hex(await hash(enc.encode('qentra-solana-v1'), pub(requestAddress), bytes(userContribution), bytes(providerContribution), bytes(inputDigest)));
  return { schemaVersion: 4, id: `solana:fixture-network:${program}:2`, network: 'fixture-network', contract: program, sequence: '2',
    createdAt: '2026-10-22T00:00:00.000Z', input, inputDigest, state: 'fulfilled', verification: 'pending', delivery: 'not-requested',
    requester: SYSTEM_PROGRAM, recipient: SYSTEM_PROGRAM, feePaid: '0', feeQuoted: '500000', paymentVerified: false,
    userContribution, providerCommitment, numHashes: 1, providerContribution, outputBytes,
    mapping: await mapOutput(outputBytes, input.mapping), storage: 'events', requestAddress, callbackProgram: SYSTEM_PROGRAM, callbackAccount: SYSTEM_PROGRAM };
}
