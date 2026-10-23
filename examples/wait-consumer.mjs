// Installed native read proof with inert account codecs; no network or wallet.
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
import { getEventListeners } from 'node:events';
import { performance } from 'node:perf_hooks';
import { QVRFClient, verifyProtocolRecord } from '@qentra/sdk';
import { address } from '@solana/kit';
import { SYSTEM_PROGRAM, bytes, hex, hash, pub } from '@qentra/sdk/solana';
import { getConfigEncoder, getRequestRecordEncoder } from '@qentra/sdk/generated';
import { waitAndReopen } from './node_modules/@qentra/sdk/examples/wait-and-reopen.mjs';
const program='CcoAe9c5yenzozkSqdiJAmaCeoZTiSSV5urBUnC1oa8d',network=SYSTEM_PROGRAM;
const options={rpcUrl:'http://127.0.0.1:1',program},id=`solana:${network}:${program}:2`,enc=new TextEncoder();
const saved={id,program,rpcUrl:options.rpcUrl};await writeFile('saved-wait-draw.json',JSON.stringify(saved));
const counts={signs:0,sends:0,quotes:0,network:0},checks=[],unhandled=[];
const networkFetch=globalThis.fetch;globalThis.fetch=async()=>{counts.network++;throw Error('Network forbidden');};
const onUnhandled=error=>unhandled.push(String(error));process.on('unhandledRejection',onUnhandled);
const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout,activeTimers=new Set();
globalThis.setTimeout=(fn,ms,...args)=>{let handle;handle=originalSet(()=>{activeTimers.delete(handle);fn(...args);},ms);activeTimers.add(handle);return handle;};
globalThis.clearTimeout=handle=>{activeTimers.delete(handle);return originalClear(handle);};
const originalRequest=QVRFClient.prototype.request,originalQuote=QVRFClient.prototype.quote;
QVRFClient.prototype.request=async()=>{counts.sends++;throw Error('Never request again');};
QVRFClient.prototype.quote=async()=>{counts.quotes++;throw Error('Never quote');};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const fixtures=[];
async function fixture(mode='fulfilled',gate){
 const client=new QVRFClient(options),key=await client.requestAddress(2n),configKey=await client.configAddress();
 const input={bytes:32,mapping:{kind:'weightedPick',items:['Amber','Birch','Cedar'],weights:[1,2,3]}};
 const provider='22'.repeat(32),user='33'.repeat(32),root=hex(await hash(bytes(provider))),digest=hex(await hash(enc.encode(JSON.stringify(input))));
 const output=hex(await hash(enc.encode('qentra-solana-v1'),pub(key),bytes(user),bytes(provider),bytes(digest)));
 const config={controller:address(SYSTEM_PROGRAM),operator:address(SYSTEM_PROGRAM),recipient:address(SYSTEM_PROGRAM),fee:500000n,refundSeconds:60n,next:3n,root:bytes(root),slots:32,used:1,pending:0,batchFirst:1n,bump:255};
 const state={mode,polls:0,reads:0,started:deferred()};fixtures.push(state);
 const info=keyArg=>({value:{owner:program,data:[Buffer.from(keyArg===configKey?getConfigEncoder().encode(config):getRequestRecordEncoder().encode({config:address(configKey),sequence:2n,requester:address(SYSTEM_PROGRAM),userContribution:bytes(user),root:bytes(root),numHashes:1,inputDigest:bytes(digest),output:state.mode==='fulfilled'?bytes(output):new Uint8Array(32),contribution:state.mode==='fulfilled'?bytes(provider):new Uint8Array(32),fee:500000n,requestedAt:1792627200n,status:state.mode==='fulfilled'?2:state.mode==='expired'?3:1,bump:255,inputs:enc.encode(JSON.stringify(input))})).toString('base64'),'base64']}});
 client.rpc={getGenesisHash:()=>({send:async()=>network}),getAccountInfo:keyArg=>({send:async()=>{state.reads++;state.started.resolve();if(gate){await gate.promise;gate=undefined;}return info(keyArg);}}),getSignaturesForAddress:()=>({send:async()=>[]}),sendTransaction:()=>{counts.sends++;throw Error('No submissions');}};
 const actual=client.getRequest.bind(client);client.getRequest=async value=>{state.polls++;return actual(value);};
 return {client,state};
}
function clean(signal){assert.equal(activeTimers.size,0,'wait leaked timer');if(signal)assert.equal(getEventListeners(signal,'abort').length,0,'wait leaked listener');}
async function rejected(name,promise,pattern,signal,started=performance.now()){
 await assert.rejects(promise,pattern);const elapsedMs=performance.now()-started;assert.ok(elapsedMs<800,`${name} exceeded prompt bound: ${elapsedMs}`);clean(signal);checks.push({name,elapsedMs,limitMs:800,timersAfter:activeTimers.size,listenersAfter:signal?getEventListeners(signal,'abort').length:0});
}
try{
 let f=await fixture(),controller=new AbortController();controller.abort();
 await rejected('pre-abort',f.client.waitForResult(id,{signal:controller.signal}),/Wait aborted/,controller.signal);assert.equal(f.state.polls,0);
 f=await fixture();await rejected('zero-budget-no-read',f.client.waitForResult(id,{timeoutMs:0}),/Request pending.*solana:.*without another payment/);assert.equal(f.state.polls,0);
 for(const late of ['never','resolve','reject']){
  const gate=deferred();f=await fixture('fulfilled',gate);controller=new AbortController();
  const wait=f.client.waitForResult(id,{signal:controller.signal,timeoutMs:5000});await f.state.started.promise;await pause(25);
  const at=performance.now();controller.abort();await rejected('abort-during-read-'+late,wait,/Wait aborted/,controller.signal,at);
  if(late==='resolve')gate.resolve();if(late==='reject')gate.reject(Error('Late inert read rejection'));
  await pause(40);assert.equal(f.state.polls,1);clean(controller.signal);
 }
 f=await fixture('requested');controller=new AbortController();let wait=f.client.waitForResult(id,{signal:controller.signal,timeoutMs:5000});
 await f.state.started.promise;await pause(40);assert.equal(f.state.polls,1);assert.equal(activeTimers.size,2,'deadline and poll delay should be active');let at=performance.now();controller.abort();await rejected('abort-during-poll-sleep',wait,/Wait aborted/,controller.signal,at);
 const stalled=deferred();f=await fixture('fulfilled',stalled);at=performance.now();wait=f.client.waitForResult(id,{timeoutMs:80});
 await rejected('deadline-during-stalled-read',wait,/Request pending.*solana:.*without another payment/,undefined,at);stalled.resolve();await pause(40);assert.equal(f.state.polls,1);clean();
 f=await fixture('requested');at=performance.now();await rejected('deadline-during-poll-sleep',f.client.waitForResult(id,{timeoutMs:80}),/Request pending/,undefined,at);assert.equal(f.state.polls,1);
 f=await fixture('expired');controller=new AbortController();await rejected('onchain-expired',f.client.waitForResult(id,{signal:controller.signal}),/Request expired; refund status/,controller.signal);assert.equal(f.state.polls,1);
 const bad=deferred();f=await fixture('fulfilled',bad);const ordinary=Error('Inert RPC read failure');wait=f.client.waitForResult(id);await f.state.started.promise;bad.reject(ordinary);await assert.rejects(wait,error=>error===ordinary);clean();checks.push({name:'ordinary-read-error-preserved',sameError:true});
 f=await fixture();controller=new AbortController();const record=await f.client.waitForResult(id,{signal:controller.signal});await verifyProtocolRecord(record);assert.equal(record.id,id);assert.equal(record.state,'fulfilled');assert.equal(record.verification,'verified');assert.equal(f.state.polls,1);clean(controller.signal);checks.push({name:'normal-fulfilled-verified',id:record.id,result:record.mapping.result});
 // Invoke the actual packed example with its own new read-only client. Only
 // inject this fixture's RPC; keep native getRequest/verification unchanged.
 const nativeRead=QVRFClient.prototype.getRequest;
 QVRFClient.prototype.getRequest=function(value){this.rpc=f.client.rpc;return nativeRead.call(this,value);};
 try{
  const durable=JSON.parse(await readFile('saved-wait-draw.json','utf8'));
  const reopened=await waitAndReopen({rpcUrl:durable.rpcUrl,program:durable.program},durable.id,{timeoutMs:5000});
  assert.equal(reopened.id,record.id);assert.deepEqual(reopened.mapping,record.mapping);await verifyProtocolRecord(reopened);clean();checks.push({name:'installed-example-reopen',sameSavedDraw:true,id:reopened.id,result:reopened.mapping.result});
 }finally{QVRFClient.prototype.getRequest=nativeRead;}
 const polls=fixtures.map(x=>x.polls);await pause(1100);assert.deepEqual(fixtures.map(x=>x.polls),polls,'extra poll after terminal outcome');assert.deepEqual(unhandled,[]);clean();assert.deepEqual(counts,{signs:0,sends:0,quotes:0,network:0});
 await writeFile('wait-receipt.json',JSON.stringify({passed:true,checks,...counts,savedId:id,savedFileUnchanged:JSON.parse(await readFile('saved-wait-draw.json','utf8')).id===id,actualNativeGetRequest:true,lateUnhandledRejections:unhandled.length,noFurtherPolls:true,timersAfter:activeTimers.size,fixtures:fixtures.map(({polls,reads})=>({polls,reads}))},null,2));
 console.log(JSON.stringify({boundedWait:true,checks:checks.length,...counts,sameSavedDraw:id,noFurtherPolls:true,timersAfter:activeTimers.size}));
}finally{
 globalThis.fetch=networkFetch;globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;
 QVRFClient.prototype.request=originalRequest;QVRFClient.prototype.quote=originalQuote;process.removeListener('unhandledRejection',onUnhandled);
}
