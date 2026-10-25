# Qentra Protocol SDK

Quantum randomness infrastructure for onchain applications: native Solana requests and checkable quantum-origin draws for tournament winners, allocation applicants and agent selection.

The primary `QVRFClient` is `SolanaQVRFClient`. An external wallet signs one ordinary-SOL transfer + indexed memo + proof-request transaction. Service-issued persisted quotes bind fixed rules; default shared-workspace draws have no per-draw rent. The SDK waits for checked reveal, verifies deterministic mapping, and reopens historical event or account proofs.

Program: `CcoAe9c5yenzozkSqdiJAmaCeoZTiSSV5urBUnC1oa8d`. [Mainnet program](https://explorer.solana.com/address/CcoAe9c5yenzozkSqdiJAmaCeoZTiSSV5urBUnC1oa8d) · [Developer guide](https://github.com/qentra-protocol/docs) · [Core/helpers](https://github.com/qentra-protocol/core).

Use Node 22+ and reviewed local core/SDK tarballs. Version `0.3.0-dev.0` requires core peer `0.2.0-dev.0`; no npm publication is implied. See [client guide](docs/CLIENT.md), [native recipe](examples/native-draw.ts) and [packed consumer fixture](examples/packed-consumer.mjs).

Exports: root client/types/mapping, `./solana` native primitives, `./generated` IDL codecs, `./idl` JSON interface, `./browser` retained historical source mode. Native records use schema 4; browser records use schema 1.

`npm run check` typechecks, runs focused tests, loads the native recipe, exercises the browser example and builds portable ESM. CI additionally packs both packages and executes a fresh installed consumer without source-relative imports. Its synthetic fixture performs no network payment. Source/trust, tariff changes and historical RPC retention are explained in the developer guide.

## Receive and verify a proof file offline

After installing the reviewed core/SDK tarballs, run:

```sh
./node_modules/.bin/qentra-proof verify tournament-proof.json
```

The command checks local content integrity and prints the recorded identity and reproduced winner/allocation with `scope: "offline-content-integrity"`. No wallet, RPC or payment is used. Organizers export fulfilled draws with `exportProofFile(record)`; recipients import with `parseProofFile(text)` and can inspect `verifyProofFile(record)`. See the [proof-file journey](docs/PROOF_FILES.md) for API contracts, JSON compatibility, errors and the explicit chain-provenance boundary. Root and `./proof` exports include declarations; existing imports remain unchanged.

## Interrupted draws

Save a typed checkpoint before broadcast and reopen the same draw from a wallet-free process: [recovery guide](docs/RECOVERY.md). Recovery is read-only; it never resubmits a payment.

## Weighted allocation and agent choices

[Run the complete saved allocation recipe](docs/ALLOCATION.md): fix ordered applicants and weights before signing, recover without a wallet, and export/read back the verified application decision. The packed example uses the existing mapping and proof APIs; execution and settlement stay with the caller.

Read [bounded saved-draw waits](docs/WAITING.md) for cancellation, total deadlines and wallet-free reopening.

## Portable core proofs

SDK `0.3.0-dev.0` consumes `@qentra/core` `0.2.0-dev.0` for shared protocol types, record verification and proof-file APIs. Existing SDK imports remain compatible. A tournament recipient can verify the exported fulfilled draw with core alone, without a wallet or RPC. [Shared module and saved-file example](https://github.com/qentra-protocol/core/blob/main/docs/PROTOCOL_PROOFS.md).

## Installation

[Build from source or install matching release tarballs](docs/INSTALL.md). Releases include checksum verification and both package versions; availability follows the repository release list.
