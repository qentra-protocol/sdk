# A saved weighted allocation or agent choice

Fix the eligible applicants, their order and relative ticket weights **before requesting** randomness. This recipe selects one label; it does not execute an agent, transfer an allocation or move funds. For example, weights 1, 2 and 3 give Amber, Birch and Cedar respectively one, two and three of six tickets. Use distinct stable labels and positive integer weights; zero, fractional, negative and excessive totals reject before signing. The existing core mapper owns the deterministic domain-separated selection.

## Install and run

Use Node 22+ and the reviewed core/SDK tarballs. From an empty directory:

```sh
npm init -y
npm install --ignore-scripts /path/to/qentra-core-0.2.0-dev.0.tgz /path/to/qentra-sdk-0.3.0-dev.0.tgz
cp node_modules/@qentra/sdk/examples/allocation-draw.mjs ./allocation-draw.mjs
```

Save `applicants.json` under application change control before starting:

```json
[{"label":"Amber","weight":1},{"label":"Birch","weight":2},{"label":"Cedar","weight":3}]
```

Create `start.mjs` using your external-wallet adapter (`wallet.mjs` exports `wallet`; it must hold no exported key material):

```js
import { readFile } from 'node:fs/promises';
import { QVRFClient, RecoverableRequestError } from '@qentra/sdk';
import { startAllocation } from './allocation-draw.mjs';
import { wallet } from './wallet.mjs';
const applicants=JSON.parse(await readFile('applicants.json','utf8'));
const options={rpcUrl:process.env.RPC_URL,quoteUrl:process.env.QUOTE_URL,
 program:process.env.PROGRAM_ID,wallet};
const quote=await new QVRFClient(options).quote();
if(!quote.ready)throw Error('Wait for Qentra readiness');
// Show quote.amount/recipient/network to the caller and obtain approval before this call.
try { await startAllocation(options,applicants,'allocation-checkpoint.json',quote.amount); }
catch(error) {
 if(error instanceof RecoverableRequestError)console.error('Retain checkpoint; reopen without another payment',error.broadcastAttempted);
 throw error;
}
```

Run `node start.mjs` only for an approved initial request. The real SDK simulates and externally signs the existing native-SOL request once. The recipe exclusively creates a synced checkpoint before broadcast. It will not overwrite an earlier draw. Choose a filesystem supporting hard links and file/directory sync, or adapt persistence to your durable application store. Reserve a new checkpoint path per intentional draw; retain the original trusted rules and checkpoint. A prepared checkpoint is not confirmation of payment.

Create `reopen.mjs`; this process needs no wallet module or quote endpoint:

```js
import { readFile } from 'node:fs/promises';
import { reopenAllocation } from './allocation-draw.mjs';
const applicants=JSON.parse(await readFile('applicants.json','utf8'));
const result=await reopenAllocation({rpcUrl:process.env.RPC_URL,program:process.env.PROGRAM_ID},
 applicants,'allocation-checkpoint.json','allocation-decision.json');
if(result.state==='fulfilled')console.log('Chosen applicant:',result.decision.selected);
else console.log('No actionable allocation:',result.state,result.scope);
```

Run `node reopen.mjs`. It reuses `recoverRequest` and its existing chain/event/payment verification, verifies the fulfilled proof and original request/rule bindings, then writes a new decision file. Pending, not-found, failed or expired draws export no decision and never resubmit. Retry read-only inspection with a new output path if needed; do not restart payment to recover an uncertain draw.

## Read and act on the exported decision

```js
import { readFile, writeFile } from 'node:fs/promises';
import { readAllocationDecision } from './allocation-draw.mjs';
const rules=JSON.parse(await readFile('applicants.json','utf8'));
const decision=await readAllocationDecision('allocation-decision.json',rules,'allocation-checkpoint.json');
console.log(decision.requestId,decision.selected);
// Optional standalone schema-4 proof for the existing installed CLI:
await writeFile('allocation-proof.json',JSON.stringify(decision.proof));
```

Run this code from `readback.mjs` with `node readback.mjs`, then `npx --no-install qentra-proof verify allocation-proof.json`. The decision contains only request ID, fixed-input digest, selected label and the existing schema-4 proof. No alternate proof algorithm is introduced. Readback recomputes offline integrity and compares the retained checkpoint and approved rules; it is not a new chain/payment attestation. Preserve the trusted checkpoint/rules separately from incoming decision files. Changed labels, weights, request identity or selected result reject. The CLI alone verifies proof content, not your application's independently approved rules.

After checking, the application may record the selected label in its own work queue or allocation plan keyed by `requestId`. Application authorization and once-only processing belong to that caller; this example performs neither execution nor settlement. Use explicit application controls before any side effect.

The isolated installed-package consumer exercises the same exported recipe against inert RPC responses: one ephemeral initial signature/submission, interrupted caller, fresh wallet-free recovery, identical mapping, file readback, invalid rules/tampered decisions and non-actionable states. It makes no production RPC submission. See [recovery](RECOVERY.md) and [proof files](PROOF_FILES.md).
