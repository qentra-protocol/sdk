# Native Solana quickstart

Use Node 22+, an explicit RPC endpoint, Qentra's current quote endpoint and a wallet adapter you control. The SDK never creates a wallet or accepts a private key. A wallet implements `{ address: string, signTransaction(wire: Uint8Array): Promise<Uint8Array> }` and returns the signed wire bytes unchanged except for signatures.

Install the reviewed core and SDK tarballs together:

```sh
npm install /path/to/qentra-core-0.1.0-dev.0.tgz /path/to/qentra-sdk-0.2.0-dev.0.tgz
```

```ts
import { QVRFClient, verifyProtocolRecord } from '@qentra/sdk';
import type { SolanaWallet, ProtocolRecord } from '@qentra/sdk';

async function selectWinner(rpcUrl: string, quoteUrl: string,
  wallet: SolanaWallet, save: (r: ProtocolRecord) => Promise<void>) {
  const client = new QVRFClient({ rpcUrl, quoteUrl, wallet,
    program: 'CcoAe9c5yenzozkSqdiJAmaCeoZTiSSV5urBUnC1oa8d' });
  const quote = await client.quote();
  if (!quote.ready) throw Error('Wait for Qentra readiness');
  const pending = await client.request({ bytes: 32,
    mapping: { kind: 'pickUnique', items: ['Amber', 'Birch', 'Cedar'], count: 1 }
  }, { expectedFee: quote.amount });
  await save(pending);
  const result = await client.waitForResult(pending.id);
  await verifyProtocolRecord(result);
  await client.verify(result);
  await save(result);
  return result.mapping!.result;
}
```

Review the quoted amount before calling `request`. That call obtains a requester/sequence-bound persisted quote and composes ordinary SOL transfer, indexed memo and proof-request instructions into one externally signed transaction. Mainnet requires `quoteUrl`. A changed price causes a review error before signing when `expectedFee` is supplied.

Save the ID before waiting. A timeout means reopen this ID, not create/pay another draw. If confirmation itself times out, save the transaction signature reported in the error, inspect its status and recover the associated request through `getRequest`/`listRequests` before retrying. Read [recovery](recovery.md).

For an allocation, fix `mapping: { kind: 'shuffle', items: ['Amber', 'Birch', 'Cedar'] }` before payment. For sampling, use `pickUnique` with a fixed count; for weighted selection use `weightedPick` with fixed weights. Rules, labels and quote identity are included in the input digest; do not remap after the reveal.

# SDK API · 0.2.0-dev.0

`QVRFClient` and `OnchainQVRFClient` alias `SolanaQVRFClient`.

| Surface | Contract |
| --- | --- |
| constructor | `{ rpcUrl, program, wallet?, quoteUrl?, requestStorage?: 'legacy', symbol? }`; native currency is SOL |
| `quote()` | `{ amount: bigint, recipient, symbol: 'SOL', decimals: 9, capacity: bigint, noRequestRent, ready }` |
| `serviceQuote(requester?, sequence?)` | GET current price or POST bound persisted identity; validates program, recipient, amount, expiry and request identity |
| `approveFee()` | Requires connected wallet and returns quote; no separate allowance transaction |
| `request(input, { expectedFee? })` | Input `{ bytes: 32, mapping, serviceQuote? }`; SDK binds service quote itself; returns schema-4 record after confirmation |
| `getRequest(sequenceOrId)` | Reopens historical account or event record; IDs bind network, program and sequence |
| `waitForResult(id, { timeoutMs?, signal? })` | Polls to fulfilled; default 120000 ms; rejects expiry, cancellation or pending timeout |
| `subscribe(id, listener)` | Polls approximately every 1500 ms; returns unsubscribe function |
| `verify(record)` | Recomputes proof and compares authoritative RPC record fields, mapping and paid receipt |
| `verifyProtocolRecord(record)` | Offline fixed-input digest, commitment chain, domain-separated output and deterministic mapping checks |
| `listRequests()` | Up to 64 newest sequences; availability depends on RPC history |
| `verifyPayment(record)` | Exact transfer, successful transaction, signed sender, memo and same-transaction proof request |
| `expire(id)` | Explicit wallet-authorized terminal expiry; not a refund transfer |

Root also exports `mapOutput`, `ProtocolInput`, `ProtocolRecord`, `RequestRecord` (schema-4 alias), `SolanaWallet`, `MappingConfig`, `Mapping`. `@qentra/sdk/solana` exposes lower-level encoding/payment helpers; `@qentra/sdk/generated` exposes IDL-derived account/event/instruction codecs; `@qentra/sdk/idl` resolves the JSON interface. Generated controller/fulfillment codecs are protocol interfaces, not access to Qentra's private execution service.

`@qentra/sdk/browser` retains the historical browser client, adapter and schema-1 persistence helpers. It is a separate source mode; schema-1 records are not Solana proof records.

Application mapping results are `number | string | string[]`. Quote `amount` and capacity are bigint; use strings for JSON transport. Protocol records already store fees and sequence as decimal strings. No callback registration, escrow allowance, subscription balance or token request API is part of the selected native draw journey. The schema retains callback/delivery fields for compatibility; native draws use zero callback addresses and `not-requested` delivery.

# Pending states without duplicate payment

There are three distinct points:

- Before signing: service quote may reject stale/unhealthy fulfillment, changed price, capacity or occupied workspace. Retry readiness/quote checks; no successful wallet payment has occurred yet.
- After signing/submission: confirmation may be pending or the blockhash may expire. The SDK reports the signature in its error. Save it, inspect the same RPC's transaction/status and recover the indexed request before deciding whether any new transaction is needed. A network error alone is not proof that payment failed.
- After confirmed request: save `record.id` and `requestTx`; polling can time out or the source can remain pending. Call `getRequest(id)`, `waitForResult(id)` or subscribe to this same ID. Do not call `request()` again for a pending paid draw.

`waitForResult` times out after 120 seconds by default. Cancellation stops waiting, not chain processing or payment. An expired record is terminal and must be reconciled with the service's refund receipt; expiry is not an onchain fee refund. Existing paid IDs remain tracked even when new quotes are refused.

```ts
const unsubscribe = client.subscribe(savedId, record => {
  // Save and display the existing record; never pay inside this listener.
  console.log(record.id, record.state, record.paymentVerified);
});
// On leaving the view: unsubscribe();
```

Use caller-owned durable storage. The SDK returns records but does not automatically persist schema-4 data. Catch wait/confirmation errors and retain identity/signature before closing the application. When archived RPC data is missing, keep the saved proof and use an archive-capable endpoint for chain comparison.

# Offline proof files

Use `exportProofFile(result)` after fulfillment and `parseProofFile(json)` to reopen a received file. Both run the existing verifier before returning. `verifyProofFile(record)` returns an `offline-content-integrity` summary without trusting persisted status flags. The installed `qentra-proof verify <proof.json>` command prints the recorded ID and reproduced mapping, or exits nonzero on failure. It never creates a client or calls a wallet/RPC. See [proof files](PROOF_FILES.md) for the complete organizer/recipient journey and chain-backed comparison boundary.

## Interrupted draws

Save a typed checkpoint before broadcast and reopen the same draw from a wallet-free process: [recovery guide](RECOVERY.md). Recovery is read-only; it never resubmits a payment.
