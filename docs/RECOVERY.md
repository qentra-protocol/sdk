# Reopen an interrupted tournament draw

Use `request(input, { expectedFee, checkpoint })` to preserve a draw across process interruption. The callback receives a JSON-serializable `RecoveryCheckpoint` after simulation and the external wallet's single signature, **before broadcast**. Await durable storage there. A callback rejection prevents `sendTransaction`.

```js
import { QVRFClient, parseRecoveryCheckpoint } from '@qentra/sdk';
import { readFile, writeFile, rename } from 'node:fs/promises';
const client = new QVRFClient({ rpcUrl, program, quoteUrl, wallet });
const quote = await client.quote();
const requested = await client.request({
  bytes: 32,
  mapping: { kind: 'pickUnique', items: ['Amber', 'Birch', 'Cedar'], count: 1 },
}, {
  expectedFee: quote.amount,
  checkpoint: async handle => {
    await writeFile('tournament.json.tmp', JSON.stringify(handle), { flag: 'wx' });
    await rename('tournament.json.tmp', 'tournament.json');
  },
});
```

Choose storage with the durability your application requires, and a distinct file/key for each draw. Atomic file replacement prevents partial JSON; disk durability across power failure may require filesystem synchronization. The checkpoint has no wallet key or signed transaction bytes. It binds the network genesis hash, program, sequence/PDA, requester, immutable fixed inputs/digest, contribution, provider commitment, recipient/fee, actual transaction signature and blockhash lifetime. It is a prepared signed handle, **not confirmation or proof of payment**. Keep it even if request confirmation or subsequent record retrieval fails.

If submission/confirmation/record retrieval throws `RecoverableRequestError`, `error.checkpoint` retains this binding and `error.broadcastAttempted` distinguishes an attempted send from failed checkpoint persistence. Do not turn an ambiguous send failure into a new request. Existing callers can continue using `request` and its returned `ProtocolRecord`; checkpoint persistence is opt-in.

## A new wallet-free process

```js
const reader = new QVRFClient({ rpcUrl, program });
const handle = await parseRecoveryCheckpoint(await readFile('tournament.json', 'utf8'));
const recovered = await reader.recoverRequest(handle);
console.log(recovered.state, recovered.scope, recovered.record?.mapping);
```

`recoverRequest` performs one read-only inspection, using the existing request/account or event decoder and payment/proof checks. It never fetches a price quote, discovers a wallet, signs, pays, expires a request or submits/rebroadcasts a transaction. Repeat the **read**, not `request`, to wait for fulfillment. Network/program/PDA, transaction, identity, fee, commitment and fixed-input mismatches reject. Application mutation after invoking `request` cannot alter the saved input snapshot.

| State | Interpretation |
| --- | --- |
| `pending`, submission scope | No readable request yet, or signature is still pending. An archive-capable RPC may be needed. |
| `failed`, submission scope | RPC reports failure for the saved signature; not a fulfilled draw. |
| `expired`, submission scope | Lifetime elapsed and RPC returned neither signature status nor request proof. Absence is not proof that another payment is safe. |
| `pending`, request scope | Same request found; waiting for fulfillment or verified payment evidence. |
| `fulfilled`, request scope | Same draw, reproduced mapping and verified atomic payment. |
| `expired`, request scope | Same request's expiration was read from chain history. |

RPC outages and malformed/binding-invalid records reject without sending anything. A checkpoint is caller-owned data, not an authenticated receipt by itself; keep the original trusted copy. Successful reopening requires the original chain/event history to remain readable.

## Installed example and proof

[interrupted-draw.mjs](../examples/interrupted-draw.mjs) exports `startTournament` and wallet-free `reopenTournament`. After fulfillment, it writes a proof using `exportProofFile`; verify that file with the existing `qentra-proof verify proof.json` command or [proof-file API](PROOF_FILES.md).

The package proof installs packed core/SDK into a fresh consumer, uses real Kit transaction encoding and one ephemeral external-wallet signature against inert RPC fixtures, saves before an ambiguous send failure and exits. A fresh process without a wallet reads the file and verifies the same event-bound draw/payment/result through the installed package. It also exercises persistence failure, pending/not-found/failed/expired states and binding rejection, with zero recovery signatures or submissions. This fixture performs no production RPC submission.
