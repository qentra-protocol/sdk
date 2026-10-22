import { readFile, writeFile } from 'node:fs/promises';
import { exportProofFile, parseProofFile, verifyProofFile, type ProtocolRecord } from '../src/index.js';

// Call after waitForResult returns a fulfilled tournament/allocation draw.
export async function saveProof(record: ProtocolRecord, path: string) {
  await writeFile(path, await exportProofFile(record), 'utf8');
}
// Recipient needs only the saved file and installed SDK, not a client or wallet.
export async function readProof(path: string) {
  const record = await parseProofFile(await readFile(path, 'utf8'));
  return verifyProofFile(record);
}
