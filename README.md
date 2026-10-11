# Qentra Protocol SDK

Randomness infrastructure for the quantum era: native Solana requests and checkable quantum-origin draws for tournament winners, allocation applicants and agent selection.

The primary `QVRFClient` is `SolanaQVRFClient`. An external wallet signs one ordinary-SOL transfer + indexed memo + proof-request transaction. Service-issued persisted quotes bind fixed rules; default shared-workspace draws have no per-draw rent. The SDK waits for checked reveal, verifies deterministic mapping, and reopens historical event or account proofs.

Program: `CcoAe9c5yenzozkSqdiJAmaCeoZTiSSV5urBUnC1oa8d`. [Mainnet program](https://explorer.solana.com/address/CcoAe9c5yenzozkSqdiJAmaCeoZTiSSV5urBUnC1oa8d) · [Developer guide](https://github.com/nicpilsner/qentra-docs) · [Core/helpers](https://github.com/nicpilsner/project-repo).

Use Node 22+ and reviewed local core/SDK tarballs. Version `0.2.0-dev.0` requires core peer `0.1.0-dev.0`; no npm publication is implied. See [client guide](docs/CLIENT.md), [native recipe](examples/native-draw.ts) and [packed consumer fixture](examples/packed-consumer.mjs).

Exports: root client/types/mapping, `./solana` native primitives, `./generated` IDL codecs, `./idl` JSON interface, `./browser` retained historical source mode. Native records use schema 4; browser records use schema 1.

`npm run check` typechecks, runs focused tests, loads the native recipe, exercises the browser example and builds portable ESM. CI additionally packs both packages and executes a fresh installed consumer without source-relative imports. Its synthetic fixture performs no network payment. Source/trust, tariff changes and historical RPC retention are explained in the developer guide.
