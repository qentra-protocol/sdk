// Synthetic fixture: no network calls, wallet funds or source-physics claims.
import assert from 'node:assert/strict';
import { QVRFClient, SolanaQVRFClient, mapOutput, verifyProtocolRecord } from '@qentra/sdk';
import { bytes, hex, hash, pub, paymentMemo, SYSTEM_PROGRAM, MEMO_PROGRAM } from '@qentra/sdk/solana';
import { getRequestEventInstructionDataDecoder, getRequestEventInstructionDataEncoder } from '@qentra/sdk/generated';
const program='CcoAe9c5yenzozkSqdiJAmaCeoZTiSSV5urBUnC1oa8d';
const requester=SYSTEM_PROGRAM;
const enc=new TextEncoder();
const input={bytes:32,mapping:{kind:'pickUnique',items:['Amber','Birch','Cedar'],count:1}};
const config={controller:requester,operator:requester,recipient:requester,fee:1n,refundSeconds:60n,next:2n,root:'ab'.repeat(32),slots:32,used:1,pending:0,batchFirst:1n,bump:255};
const client=new QVRFClient({rpcUrl:'http://127.0.0.1:1',program,quoteUrl:'https://quote.invalid/api/quote',wallet:{address:requester,signTransaction:async wire=>{signatures++;return wire;}}});
assert.equal(QVRFClient,SolanaQVRFClient);
let signatures=0; let wire;
client.networkId=async()=> 'fixture-network';client.config=async()=>config;client.streamReady=async()=>true;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(_url,init)=>{const bound=init?.body?JSON.parse(String(init.body)):{};return new Response(JSON.stringify({program,recipient:requester,amount:'500000',id:'11111111-1111-4111-8111-111111111111',requester:bound.requester??requester,sequence:bound.sequence??'2',requestAddress:await client.requestAddress(2n),expiresAt:Math.floor(Date.now()/1000)+60}),{status:200});};
client.rpc={
 getLatestBlockhash:()=>({send:async()=>({value:{blockhash:SYSTEM_PROGRAM,lastValidBlockHeight:999n}})}),
 simulateTransaction:()=>({send:async()=>({value:{err:null}})}),
 sendTransaction:value=>({send:async()=>{wire=value;return 'fixture-signature';}}),
 getSignatureStatuses:()=>({send:async()=>({value:[{err:null,confirmationStatus:'confirmed'}]})}),
};
const contribution='22'.repeat(32);let user='33'.repeat(32);const root=hex(await hash(bytes(contribution)));config.root=root;
let record;
client.getRequest=async()=>record;
const key=await client.requestAddress(2n);const fixedInput={...input,serviceQuote:'11111111-1111-4111-8111-111111111111'};
let digest=hex(await hash(enc.encode(JSON.stringify(fixedInput))));
let output=hex(await hash(enc.encode('qentra-solana-v1'),pub(key),bytes(user),bytes(contribution),bytes(digest)));
record={schemaVersion:4,id:`solana:fixture-network:${program}:2`,network:'fixture-network',contract:program,sequence:'2',createdAt:'2026-10-11T00:00:00.000Z',input:fixedInput,inputDigest:digest,state:'fulfilled',verification:'verified',delivery:'not-requested',requester,feePaid:'500000',feeQuoted:'500000',paymentVerified:true,recipient:requester,userContribution:user,providerCommitment:root,numHashes:1,providerContribution:contribution,outputBytes:output,mapping:await mapOutput(output,input.mapping),storage:'events',requestAddress:key,callbackProgram:SYSTEM_PROGRAM,callbackAccount:SYSTEM_PROGRAM};
const quote=await client.quote();assert.equal(quote.amount,500000n);assert.equal(quote.noRequestRent,true);
const actualSend=client.send.bind(client);
client.send=async instructions=>{
 assert.equal(instructions.length,3);assert.equal(instructions[0].programAddress,SYSTEM_PROGRAM);assert.equal(instructions[1].programAddress,MEMO_PROGRAM);
 const decoded=getRequestEventInstructionDataDecoder().decode(instructions[2].data);
 const boundInput=JSON.parse(new TextDecoder().decode(decoded.inputs));assert.deepEqual(boundInput,fixedInput);assert.equal(decoded.quotedFee,500000n);assert.equal(hex(new Uint8Array(decoded.quotedRoot)),root);
 user=hex(new Uint8Array(decoded.userContribution));digest=hex(await hash(enc.encode(JSON.stringify(boundInput))));output=hex(await hash(enc.encode('qentra-solana-v1'),pub(key),bytes(user),bytes(contribution),bytes(digest)));
 record={...record,input:boundInput,inputDigest:digest,userContribution:user,outputBytes:output,mapping:await mapOutput(output,input.mapping)};
 return actualSend(instructions);
};
const request=await client.request(input,{expectedFee:quote.amount});assert.equal(signatures,1);assert.ok(wire);
const result=await client.waitForResult(request.id);await verifyProtocolRecord(result);assert.equal(await client.verify(result),true);
const saved=JSON.stringify(result);const reopened=JSON.parse(saved);await verifyProtocolRecord(reopened);assert.deepEqual(reopened.mapping,result.mapping);
const data=getRequestEventInstructionDataEncoder().encode({sequence:2n,inputs:enc.encode(JSON.stringify(fixedInput)),userContribution:bytes(user),quotedFee:500000n,quotedRoot:bytes(root)});
const decoded=getRequestEventInstructionDataDecoder().decode(data);assert.equal(decoded.quotedFee,500000n);assert.equal(decoded.sequence,2n);
assert.equal(paymentMemo(key),`QENTRA:request:${key}`);assert.notEqual(SYSTEM_PROGRAM,MEMO_PROGRAM);
await assert.rejects(()=>client.request(input,{expectedFee:1n}),/price changed/);assert.equal(signatures,1);
config.fee=900000n;await verifyProtocolRecord(reopened);assert.equal(reopened.feeQuoted,'500000');
await assert.rejects(()=>verifyProtocolRecord({...reopened,input:{...reopened.input,serviceQuote:'changed'}}),/Fixed inputs/);
console.log(JSON.stringify({fixture:true,packageConsumer:true,oneExternalWalletCall:signatures,noRequestRent:quote.noRequestRent,proofVerified:true,exportReopened:true,historicalFee:reopened.feeQuoted,mapping:reopened.mapping,wireBytes:wire.length}));

globalThis.fetch=originalFetch;
