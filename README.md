# Qentra SDK

Typed request lifecycle for Qentra Protocol, quantum-verifiable randomness infrastructure for onchain applications.

Request entropy, observe generation, map an application outcome and export a reproducible record. The SDK imports the canonical `@qentra/core` package rather than maintaining another helper implementation.

## Develop from source

Use Node 22 or newer. First build the adjacent [core repository](https://github.com/nicpilsner/project-repo): run `npm install`, `npm run check`, and `npm pack` there. In this SDK repository, run `npm install --no-save ../project-repo/qentra-core-0.1.0-dev.0.tgz`, then `npm run check`. This supplies the exact development peer package without an npm publication. Keep the archive on the test runner; never attach shared account credentials to a cross-repository build.

`npm run check` typechecks the SDK, tests and example, runs the lifecycle tests, executes `examples/request-and-map.ts`, and builds ESM/declarations. For a browser integration use a bundler and Web Crypto in a secure context. Select `IndexedDBRepository` for local browser history or `MemoryRepository` for ephemeral sessions.

See [client reference](docs/CLIENT.md), [quickstart](https://github.com/nicpilsner/qentra-docs/blob/main/quickstart.md) and [core source boundary](https://github.com/nicpilsner/project-repo/blob/main/docs/SOURCE.md).
