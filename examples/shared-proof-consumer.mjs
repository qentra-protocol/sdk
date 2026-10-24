import assert from 'node:assert/strict';
import * as core from '@qentra/core';
import * as sdk from '@qentra/sdk';
import * as proof from '@qentra/sdk/proof';
import * as solana from '@qentra/sdk/solana';
for (const key of ['parseProofFile','exportProofFile','verifyProofFile']) {
 assert.equal(sdk[key], core[key]); assert.equal(proof[key], core[key]);
}
assert.equal(sdk.verifyProtocolRecord, core.verifyProtocolRecord);
assert.equal(solana.verifyProtocolRecord, core.verifyProtocolRecord);
assert.equal(sdk.mapOutput, core.mapOutput);
console.log('SDK entrypoints consume identical installed core functions');
