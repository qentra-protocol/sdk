/** Portable proof APIs share the core verifier; wallet/RPC transport stays in the SDK. */
export { parseProofFile, exportProofFile, verifyProofFile } from '@qentra/core';
export type { OfflineProofVerification } from '@qentra/core';
