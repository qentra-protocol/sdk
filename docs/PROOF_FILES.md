# Share a draw as an offline proof file

A tournament organizer or allocation developer can export a fulfilled schema-4 draw and send its JSON file to recipients. Recipients recompute the fixed-input digest, commitment/reveal chain, output and original application mapping with the installed SDK. They do not create a client, connect a wallet, pay or contact an RPC.

Install the reviewed core and SDK tarballs together with Node 22+:

```sh
npm install /path/to/qentra-core-0.2.0-dev.0.tgz /path/to/qentra-sdk-0.3.0-dev.0.tgz
```

## Organizer: save the fulfilled draw

Keep the application rules fixed before requesting the draw. Tournament rules can use `pickUnique`; allocation rules can use `shuffle` or `weightedPick`. The proof file preserves those rules and their recorded result rather than asking the recipient to provide a new mapping.

```ts
import { writeFile } from 'node:fs/promises';
import { exportProofFile } from '@qentra/sdk';

// result is the fulfilled ProtocolRecord returned by waitForResult(savedId).
await writeFile('tournament-proof.json', await exportProofFile(result), 'utf8');
```

Export checks the record before writing JSON text. It rejects pending/expired records and inconsistent proofs. The output is indented UTF-8 JSON with a trailing newline. Repeated exports of the same record are byte-identical. Fixed-input and mapping object key order is preserved: it participates in the existing schema-4 digest/mapping ABI and must not be sorted or reconstructed by a generic JSON canonicalizer. There is no new envelope or schema migration; existing fulfilled schema-4 JSON records can be imported directly.

## Recipient: installed command

```sh
./node_modules/.bin/qentra-proof verify tournament-proof.json
```

A successful command prints JSON containing `scope: "offline-content-integrity"`, the recorded ID, input digest, output bytes and recomputed mapping. Use `mapping.result` for the winner or allocation. Invalid JSON, unsupported schema, missing fields, changed rules, altered winners and inconsistent reveals/outputs print an error on stderr and exit 1. Invalid command arguments exit 2. `qentra-proof --help` documents usage. The command has no RPC, wallet, payment or telemetry options; all verification is local and read-only.

## Recipient: SDK import and verification

```ts
import { readFile } from 'node:fs/promises';
import { parseProofFile, verifyProofFile } from '@qentra/sdk/proof';

const record = await parseProofFile(await readFile('tournament-proof.json', 'utf8'));
const proof = await verifyProofFile(record);
console.log(proof.id, proof.mapping.result);
```

`parseProofFile(text): Promise<ProtocolRecord>` validates JSON shape and runs `verifyProtocolRecord` before returning a detached record. `exportProofFile(record): Promise<string>` verifies a detached snapshot before serialization. `verifyProofFile(value): Promise<OfflineProofVerification>` checks a decoded record and returns a scoped summary. All three functions and the summary type are exported from the root and `./proof` subpath. These APIs do not trust saved `verification` or `paymentVerified` flags and do not upgrade them.

## What the recipient checks

Offline verification establishes internal content integrity: the fixed inputs hash to the stored digest, the reveal hashes to the commitment, output bytes bind the request address/contributions/digest, and the mapping reproduces the recorded outcome. It does not authenticate a file's origin or establish chain inclusion, commitment timing, network/program identity, payment status or physical source provenance. IDs, transaction references, timestamps and receipt metadata remain recorded context. A self-consistent synthetic file can pass these local checks.

For chain-backed comparison use an explicitly constructed `QVRFClient` with a chosen RPC and `await client.verify(record)`. That separate read-only operation reopens the record from RPC; it is not part of the offline command. Preserve original transaction links and trusted chain references when sharing proofs.

The [installed consumer](../examples/offline-proof-consumer.mjs) exercises tournament, shuffled allocation and weighted-selection files, changed winners/inputs/reveals/outputs, malformed files and the actual packaged bin. Its data is synthetic; it makes no live draw or payment.

## Shared core implementation

The SDK root and proof subpath reexport proof-file APIs from `@qentra/core` `0.2.0-dev.0`. `verifyProtocolRecord` and `ProtocolInput` / `ProtocolRecord` also come from core; wallet/RPC transport and recovery remain in the SDK. Recipients can install core alone to check exported fulfilled schema4 draws. See [core proof module guide](https://github.com/nicpilsner/qentra-core/blob/main/docs/PROTOCOL_PROOFS.md).
