# Client reference

Construct `QVRFClient({ adapter, repository })`. The implemented `BrowserEntropyAdapter` calls `crypto.getRandomValues` and accepts integer byte counts from 16 through 4096. The adapter returns hexadecimal output, with ID `qentra-browser-v1` and mode `browser-cryptographic`.

| Method | Behavior |
|---|---|
| `request({ bytes })` | Persists a created record and schedules generation; resolves with the request ID before generation starts. |
| `getRequest(id)` | Returns an isolated current-session record or repository record. |
| `subscribe(id, listener)` | Observes later updates; returns an unsubscribe function. It does not replay the current state. |
| `waitForResult(id, { signal, timeoutMs })` | Resolves a produced record, rejects failed/unknown requests, and supports abort or timeout. Default timeout is 10000 ms. Cleans up its wait subscription. |
| `applyMapping(id, config)` | Requires a produced result, records a deterministic mapping, persists it and emits a mapped event. |
| `helpers` | Convenience access to `uniformInt`, `shuffle`, `weightedPick` and `pickUnique`. |

Lifecycle states are created, generating, produced and failed. A mapping appends a `mapped` event while keeping state produced. Subscribe immediately after `request` if observing generation transitions matters. Use `try/finally` to unsubscribe when the consuming screen or operation ends.

A persistence error is surfaced through `storageError`; the current-session result remains available for export. `waitForResult` cancels the caller's wait, not the underlying generation. Listeners should avoid throwing: subscriber exceptions are not isolated in the current implementation. Integrators should validate adapter output when importing a record and before treating a custom adapter as a trusted source.

Re-exported core interfaces and validators keep the same data contracts. Source verification and delivery are distinct from reproducing a mapped result. See the core source guide for exact evidence semantics.
