# Bounded waits for saved draws

A tournament, allocation or agent can stop waiting for an existing draw without
requesting or paying for another one. Keep the original draw ID (or the durable
recovery checkpoint from the interrupted-draw guide) in application-owned storage.

```js
import { QVRFClient } from '@qentra/sdk';
const client = new QVRFClient({ rpcUrl, program }); // wallet-free read client
const controller = new AbortController();
// Wire controller.abort() to your tournament/agent cancellation event.
try {
  const draw = await client.waitForResult(savedId, {
    signal: controller.signal,
    timeoutMs: 30000,
  });
  // Use the existing verified mapping and your original fixed application rules.
  console.log(draw.id, draw.mapping.result);
} catch (error) {
  // Retain savedId. A new wait can reopen it; do not call request() to retry.
  console.error(error.message);
}
// Later, with a fresh signal/deadline (an aborted signal cannot be reused):
const reopened = await client.waitForResult(savedId, { timeoutMs: 30000 });
```

`timeoutMs` is a total local wait budget (default 120000ms), including RPC reads
and one-second polling delays. A pre-aborted signal does not start a read.
Cancellation rejects with `Wait aborted`; a deadline rejects with `Request pending`
and the original ID/reopen instruction. An onchain expired draw retains the
existing `Request expired` outcome; ordinary RPC errors still reject directly.
Fulfilled records retain the existing native verification and mapping behavior.

All local timers/listeners are disposed on fulfillment, expiry, read error, abort
or deadline. Late RPC success/failure cannot restart polling or override the
terminal outcome. This bounds the caller's wait, not physical network activity:
a transport that ignores cancellation may finish its already-started read later.
It does not cancel blockchain fulfillment, delete the saved draw, refund a payment
or authorize an application side effect. Resume a durable submission checkpoint
with `recoverRequest` when its broadcast/confirmation state needs inspection.

## Installed example

After installing the SDK and its matching core peer package, run:

```sh
node node_modules/@qentra/sdk/examples/wait-and-reopen.mjs RPC PROGRAM SAVED_ID draw-proof.json
```

Ctrl-C aborts the local wait. Re-run the same command with the saved ID and a new
proof filename to reopen without a wallet, quote, signature or submission. The
example exports the fulfilled draw using the existing proof-file API; use the
installed `qentra-proof` CLI to verify the exported file offline.
