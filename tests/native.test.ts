import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { SolanaQVRFClient, SYSTEM_PROGRAM, MEMO_PROGRAM, paymentMemo, instructionData, bytes } from '../src/solana.js';
import { getRequestEventInstructionDataEncoder } from '../src/generated/index.js';
const program='CcoAe9c5yenzozkSqdiJAmaCeoZTiSSV5urBUnC1oa8d';
function fixture(){
 const client=new SolanaQVRFClient({rpcUrl:'http://127.0.0.1:1',program,quoteUrl:'https://quote.invalid/api/quote'});
 client.config=async()=>({controller:SYSTEM_PROGRAM,operator:SYSTEM_PROGRAM,recipient:SYSTEM_PROGRAM,fee:1n,refundSeconds:60n,next:2n,root:'aa'.repeat(32),slots:32,used:1,pending:0,batchFirst:1n,bump:255});
 return client;
}
test('service quote rejects stale, wrong recipient, requester, amount and identity bindings',async()=>{
 const client=fixture();const original=globalThis.fetch;
 const valid={program,recipient:SYSTEM_PROGRAM,amount:'500000',id:'11111111-1111-4111-8111-111111111111',requester:SYSTEM_PROGRAM,sequence:'2',requestAddress:await client.requestAddress(2n),expiresAt:Math.floor(Date.now()/1000)+60};
 try{
  for(const patch of [{amount:'0'},{amount:'18446744073709551616'},{amount:'-1'},{recipient:program},{program:SYSTEM_PROGRAM},{requester:program},{sequence:'3'},{requestAddress:program},{id:'invalid'},{expiresAt:0}]){
   globalThis.fetch=async()=>new Response(JSON.stringify({...valid,...patch}),{status:200});
   await assert.rejects(()=>client.serviceQuote(SYSTEM_PROGRAM,2n));
  }
  let posted:any;
  globalThis.fetch=async(_url,init)=>{posted=JSON.parse(String(init?.body));return new Response(JSON.stringify(valid),{status:200});};
  assert.deepEqual(await client.serviceQuote(SYSTEM_PROGRAM,2n),valid);assert.deepEqual(posted,{program,requester:SYSTEM_PROGRAM,sequence:'2'});
  globalThis.fetch=async()=>new Response('',{status:503});await assert.rejects(()=>client.serviceQuote(),/not active/);
 }finally{globalThis.fetch=original;}
});
test('generated request-event bytes align with native encoding and IDL discriminator',async()=>{
 const input=new TextEncoder().encode(JSON.stringify({bytes:32,mapping:{kind:'uniformInt',min:1,max:100},serviceQuote:'fixture'}));
 const data=getRequestEventInstructionDataEncoder().encode({sequence:2n,inputs:input,userContribution:bytes('ab'.repeat(32)),quotedFee:500000n,quotedRoot:bytes('cd'.repeat(32))});
 const {u64,u32}=await import('../src/solana.js');
 assert.deepEqual(new Uint8Array(data),await instructionData('request_event',u64(2n),u32(input.length),input,bytes('ab'.repeat(32)),u64(500000n),bytes('cd'.repeat(32))));
 const idl=JSON.parse(await readFile(new URL('../idl/qentra.json',import.meta.url),'utf8'));
 assert.equal(idl.address,program);assert.deepEqual(Array.from(data.slice(0,8)),idl.instructions.find((x:any)=>x.name==='request_event').discriminator);
});
test('payment verification requires exact transfer, signer, memo and atomic proof instruction',async()=>{
 const client=fixture(),key=await client.requestAddress(2n);
 const tx:any={meta:{err:null},transaction:{message:{accountKeys:[{pubkey:SYSTEM_PROGRAM,signer:true}],instructions:[{programId:SYSTEM_PROGRAM,parsed:{type:'transfer',info:{source:SYSTEM_PROGRAM,destination:SYSTEM_PROGRAM,lamports:500000}}},{programId:MEMO_PROGRAM,parsed:paymentMemo(key)},{programId:program,accounts:[key]}]}}};
 (client as any).rpc={getTransaction:()=>({send:async()=>tx})};
 assert.equal(await client.verifyTransfer('fixture',SYSTEM_PROGRAM,SYSTEM_PROGRAM,500000n,paymentMemo(key),key),true);
 await assert.rejects(()=>client.verifyTransfer('fixture',SYSTEM_PROGRAM,SYSTEM_PROGRAM,900000n,paymentMemo(key),key),/amount/);
 tx.transaction.message.accountKeys[0].signer=false;await assert.rejects(()=>client.verifyTransfer('fixture',SYSTEM_PROGRAM,SYSTEM_PROGRAM,500000n,paymentMemo(key),key),/sign/);tx.transaction.message.accountKeys[0].signer=true;
 tx.transaction.message.instructions[1].parsed='another';await assert.rejects(()=>client.verifyTransfer('fixture',SYSTEM_PROGRAM,SYSTEM_PROGRAM,500000n,paymentMemo(key),key),/another request/);tx.transaction.message.instructions[1].parsed=paymentMemo(key);
 tx.transaction.message.instructions.pop();await assert.rejects(()=>client.verifyTransfer('fixture',SYSTEM_PROGRAM,SYSTEM_PROGRAM,500000n,paymentMemo(key),key),/same transaction/);
});
test('pending timeout and cancellation preserve request identity without requesting again',async()=>{
 const client=fixture();(client as any).getRequest=async()=>({state:'requested'});let requests=0;(client as any).request=async()=>{requests++;};
 await assert.rejects(()=>client.waitForResult('2',{timeoutMs:0}),/reopen.*another payment/);
 const signal=new AbortController();signal.abort();await assert.rejects(()=>client.waitForResult('2',{signal:signal.signal}),/aborted/);assert.equal(requests,0);
});
