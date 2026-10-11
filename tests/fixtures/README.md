# Core package test courier

`core-source.tgz` is a content-only snapshot of the matching core package for isolated cross-package CI. It is not shipped in the SDK tarball and is not a separately maintained core implementation. Runtime consumers use the versioned `@qentra/core` peer. CI packs this exact courier and installs both tarballs into a fresh consumer; no cross-private-repository credential is supplied to package execution.
