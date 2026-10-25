# Install Qentra packages

Use Node 22 or newer. Core `0.2.0-dev.0` and SDK `0.3.0-dev.0` are a matched pair. Package distribution uses built tarballs; these development versions are not published to npm.

## From release assets

When a release provides the matched tarballs, download both archives and `SHA256SUMS` into one directory. Verify before installing:

```sh
sha256sum -c SHA256SUMS
npm install --ignore-scripts ./qentra-core-0.2.0-dev.0.tgz ./qentra-sdk-0.3.0-dev.0.tgz
```

For a core-only proof recipient, install just the core tarball. Core includes ESM and TypeScript declarations, schemas and an offline saved-proof example:

```sh
node node_modules/@qentra/core/examples/verify-proof.mjs draw-proof.json
```

With both packages installed, use the SDK CLI:

```sh
./node_modules/.bin/qentra-proof verify draw-proof.json
```

Both commands reproduce a saved application result offline. Creating a new draw instead uses the SDK quickstart, an RPC endpoint, a quote endpoint and the caller's wallet adapter.

## From source

Clone [core](https://github.com/qentra-protocol/core) and [SDK](https://github.com/qentra-protocol/sdk) into adjacent directories. Build core first:

```sh
cd core
npm install --ignore-scripts
npm run check
npm pack --ignore-scripts
cd ../sdk
npm install --ignore-scripts --no-save ../core/qentra-core-0.2.0-dev.0.tgz
npm run check
npm pack --ignore-scripts
```

Install the resulting tarballs together in a separate application using the command above. The packages expose the same verification functions; SDK adds native request, waiting and recovery APIs. See the [developer quickstart](https://github.com/qentra-protocol/docs/blob/main/quickstart.md).
