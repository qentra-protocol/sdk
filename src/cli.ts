#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseProofFile, verifyProofFile } from './proof.js';

const args = process.argv.slice(2);
if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
  console.log('Usage: qentra-proof verify <proof.json>\nChecks offline content integrity only. No RPC, wallet or payment.');
} else if (args.length !== 2 || args[0] !== 'verify' || args[1]!.startsWith('--')) {
  console.error('Usage: qentra-proof verify <proof.json>');
  process.exitCode = 2;
} else {
  try {
    const record = await parseProofFile(await readFile(args[1]!, 'utf8'));
    console.log(JSON.stringify(await verifyProofFile(record), null, 2));
  } catch (error) {
    console.error(`qentra-proof: ${error instanceof Error ? error.message : 'Verification failed'}`);
    process.exitCode = 1;
  }
}
