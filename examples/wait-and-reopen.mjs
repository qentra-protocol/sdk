// Run against a draw ID you already saved; this example never requests a draw.
import { QVRFClient, exportProofFile } from '@qentra/sdk';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function waitAndReopen(options, savedId, { signal, timeoutMs = 30000 } = {}) {
  const client = new QVRFClient(options); // No wallet or quote URL is needed.
  return client.waitForResult(savedId, { signal, timeoutMs });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [rpcUrl, program, savedId, proofPath = 'draw-proof.json'] = process.argv.slice(2);
  if (!rpcUrl || !program || !savedId) throw Error('Usage: node wait-and-reopen.mjs RPC PROGRAM SAVED_ID [PROOF_FILE]');
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  try {
    const record = await waitAndReopen({ rpcUrl, program }, savedId, { signal: controller.signal });
    await writeFile(proofPath, await exportProofFile(record), { flag: 'wx' });
    console.log(JSON.stringify({ id: record.id, result: record.mapping?.result, proofPath }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`Saved draw: ${savedId}. Re-run with this same ID to read it again.`);
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', stop);
  }
}
