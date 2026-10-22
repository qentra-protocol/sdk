import { pub, verifyProtocolRecord, type ProtocolRecord } from './solana.js';
import type { Mapping } from '@qentra/core';

/** Successful local recomputation, without RPC/source/payment provenance. */
export type OfflineProofVerification = {
  scope: 'offline-content-integrity';
  id: string;
  inputDigest: string;
  outputBytes: string;
  mapping: Mapping;
};

function invalid(path: string, detail: string): never {
  throw new Error(`Invalid proof ${path}: ${detail}`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'expected an object');
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !value.length) invalid(path, 'expected a non-empty string');
}
function oneOf(value: unknown, path: string, choices: readonly unknown[]) {
  if (!choices.includes(value)) invalid(path, `expected ${choices.join(' or ')}`);
}
function shape(value: unknown): ProtocolRecord {
  const r = object(value, 'record');
  if (r.schemaVersion !== 4) invalid('schemaVersion', 'expected 4');
  oneOf(r.state, 'state', ['fulfilled']);
  for (const field of ['id', 'network', 'contract', 'sequence', 'createdAt', 'requester', 'recipient', 'requestAddress', 'callbackProgram', 'callbackAccount']) text(r[field], field);
  if (!/^\d+$/.test(r.sequence as string) || BigInt(r.sequence as string) > 18446744073709551615n) invalid('sequence', 'expected a u64 decimal string');
  if (r.id !== `solana:${r.network}:${r.contract}:${r.sequence}`) invalid('id', 'must match network, contract and sequence');
  if (!Number.isFinite(Date.parse(r.createdAt as string))) invalid('createdAt', 'expected a timestamp');
  for (const field of ['contract', 'requester', 'recipient', 'requestAddress', 'callbackProgram', 'callbackAccount']) {
    try { pub(r[field] as string); } catch { invalid(field, 'expected a Solana address'); }
  }
  for (const field of ['feePaid', 'feeQuoted']) {
    if (typeof r[field] !== 'string' || !/^\d+$/.test(r[field] as string) || BigInt(r[field] as string) > 18446744073709551615n) invalid(field, 'expected a u64 decimal string');
  }
  if (typeof r.paymentVerified !== 'boolean') invalid('paymentVerified', 'expected a boolean');
  oneOf(r.verification, 'verification', ['pending', 'verified']);
  oneOf(r.delivery, 'delivery', ['not-requested', 'pending', 'delivered', 'failed']);
  if (r.storage !== undefined) oneOf(r.storage, 'storage', ['events', 'account']);
  for (const field of ['commitmentTx', 'requestTx', 'revealTx', 'deliveryTx']) if (r[field] !== undefined) text(r[field], field);
  for (const field of ['inputDigest', 'userContribution', 'providerCommitment', 'providerContribution', 'outputBytes']) {
    if (typeof r[field] !== 'string' || !/^[0-9a-f]{64}$/.test(r[field] as string)) invalid(field, 'expected 32 bytes of lowercase hexadecimal');
  }
  if (!Number.isInteger(r.numHashes) || (r.numHashes as number) < 1 || (r.numHashes as number) > 256) invalid('numHashes', 'expected an integer from 1 to 256');
  const input = object(r.input, 'input');
  if (input.bytes !== 32) invalid('input.bytes', 'expected 32');
  if (input.serviceQuote !== undefined) text(input.serviceQuote, 'input.serviceQuote');
  const config = object(input.mapping, 'input.mapping');
  oneOf(config.kind, 'input.mapping.kind', ['uniformInt', 'shuffle', 'weightedPick', 'pickUnique']);
  // Shape checks only; the existing mapper owns rule limits and semantics.
  if (config.kind === 'uniformInt') {
    if (typeof config.min !== 'number' || typeof config.max !== 'number') invalid('input.mapping', 'expected numeric min and max');
  } else {
    if (!Array.isArray(config.items) || config.items.some(x => typeof x !== 'string')) invalid('input.mapping.items', 'expected an array of labels');
    if (config.kind === 'weightedPick' && (!Array.isArray(config.weights) || config.weights.some(x => typeof x !== 'number'))) invalid('input.mapping.weights', 'expected an array of numbers');
    if (config.kind === 'pickUnique' && typeof config.count !== 'number') invalid('input.mapping.count', 'expected a number');
  }
  const mapping = object(r.mapping, 'mapping');
  if (mapping.version !== 'qentra-sha256-v1') invalid('mapping.version', 'expected qentra-sha256-v1');
  object(mapping.config, 'mapping.config');
  if (!(typeof mapping.result === 'number' || typeof mapping.result === 'string' || (Array.isArray(mapping.result) && mapping.result.every(x => typeof x === 'string')))) invalid('mapping.result', 'expected a number, label or labels');
  return r as unknown as ProtocolRecord;
}

function snapshot(value: unknown): unknown {
  try {
    // Detach caller-owned data before awaiting the verifier. JSON also drops
    // optional undefined properties exactly as persisted ProtocolRecord files do.
    return JSON.parse(JSON.stringify(value));
  } catch { invalid('record', 'expected JSON-serializable data'); }
}
async function checked(value: unknown): Promise<ProtocolRecord> {
  const record = shape(snapshot(value));
  await verifyProtocolRecord(record);
  return record;
}

/** Parse a schema-4 JSON file and verify its content before returning it. */
export async function parseProofFile(json: string): Promise<ProtocolRecord> {
  if (typeof json !== 'string') invalid('JSON', 'expected text');
  let value: unknown;
  try { value = JSON.parse(json); } catch { invalid('JSON', 'malformed JSON'); }
  return checked(value);
}

/** Export the verified fulfilled record; preserve fixed-input key ordering. */
export async function exportProofFile(record: ProtocolRecord): Promise<string> {
  return JSON.stringify(await checked(record), null, 2) + '\n';
}

/** Verify a decoded record without trusting its saved status flags. */
export async function verifyProofFile(value: unknown): Promise<OfflineProofVerification> {
  const record = await checked(value);
  return { scope: 'offline-content-integrity', id: record.id,
    inputDigest: record.inputDigest, outputBytes: record.outputBytes!, mapping: record.mapping! };
}
