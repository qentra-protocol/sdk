// Synthetic installed-package proof. All RPC responses are inert; keys live only in the initial process.
import assert from 'node:assert/strict';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { getBase58Decoder, getTransactionDecoder, getTransactionEncoder, address } from '@solana/kit';
import { QVRFClient, RecoverableRequestError, parseRecoveryCheckpoint, exportProofFile, parseProofFile, verifyProofFile } from '@qentra/sdk';
import { bytes, hex, hash, pub, SYSTEM_PROGRAM, MEMO_PROGRAM, paymentMemo } from '@qentra/sdk/solana';
import { getConfigEncoder, getRequestRecordEncoder, getRequestEventInstructionDataDecoder } from '@qentra/sdk/generated';
const program='CcoAe9c5yenzozkSqdiJAmaCeoZTiSSV5urBUnC1oa8d', network=SYSTEM_PROGRAM;
const enc=new TextEncoder(), checkpointFile='draw-checkpoint.json';
const applicants=[{label:'Amber',weight:1},{label:'Birch',weight:2},{label:'Cedar',weight:3}];
const {startAllocation,reopenAllocation,readAllocationDecision,allocationInput}=await import('./node_modules/@qentra/sdk/examples/allocation-draw.mjs');
const input=await allocationInput(applicants);
const contribution='22'.repeat(32), root=hex(await hash(bytes(contribution)));
const phase=process.argv[2];
const counts={signs:0,sends:0,quotes:0};
function response(value){return {send:async()=>value};}
function child(mode){return new Promise((resolve,reject)=>{const c=spawn(process.execPath,[import.meta.filename,mode],{stdio:'inherit'});c.on('error',reject);c.on('exit',code=>resolve(code));});}
async function atomic(path,value){await writeFile(path+'.tmp',JSON.stringify(value));await rename(path+'.tmp',path);}
function config(requester){return {controller:address(requester),operator:address(requester),recipient:address(requester),fee:500000n,refundSeconds:60n,next:2n,root:bytes(root),slots:32,used:1,pending:0,batchFirst:1n,bump:255};}
if(phase==='start'||phase==='persistence-failure'){
 const keys=generateKeyPairSync('ed25519'),requester=getBase58Decoder().decode(new Uint8Array(keys.publicKey.export({format:'der',type:'spki'}).subarray(-32)));
 const client=new QVRFClient({rpcUrl:'http://127.0.0.1:1',program,wallet:{address:requester,signTransaction:async wire=>{
  counts.signs++;const tx=getTransactionDecoder().decode(wire);const sig=new Uint8Array(sign(null,new Uint8Array(tx.messageBytes),keys.privateKey));
  return new Uint8Array(getTransactionEncoder().encode({...tx,signatures:{...tx.signatures,[requester]:sig}}));
 }}});
 client.networkId=async()=>network;client.config=async()=>({...config(requester),root});client.streamReady=async()=>true;
 let decoded;
 const send=client.send.bind(client);client.send=async(instructions,...args)=>{assert.equal(instructions.length,3);decoded=getRequestEventInstructionDataDecoder().decode(instructions[2].data);return send(instructions,...args);};
 client.rpc={getLatestBlockhash:()=>response({value:{blockhash:SYSTEM_PROGRAM,lastValidBlockHeight:999n}}),simulateTransaction:()=>response({value:{err:null}}),sendTransaction:wire=>({send:async()=>{
  counts.sends++;const saved=await parseRecoveryCheckpoint(await readFile(checkpointFile,'utf8'));
  const tx=getTransactionDecoder().decode(Buffer.from(wire,'base64'));assert.equal(getBase58Decoder().decode(tx.signatures[requester]),saved.signature);
  throw Error('Inert connection interrupted after accepting bytes');
 }})};
 let captured;
 const initial=structuredClone(input);
 const original=QVRFClient.prototype.request;
 QVRFClient.prototype.request=function(value,options){
  this.networkId=client.networkId;this.config=client.config;this.streamReady=client.streamReady;this.rpc=client.rpc;this.send=client.send;
  return original.call(this,value,{...options,checkpoint:async c=>{
  captured=c;assert.equal(c.userContribution,hex(new Uint8Array(decoded.userContribution)));assert.equal(c.inputDigest,hex(await hash(decoded.inputs)));
  if(phase==='persistence-failure')throw Error('Inert storage unavailable');
  assert.ok(Object.isFrozen(c.input.mapping.items));assert.deepEqual(c.input,input);
  await options.checkpoint(c);await atomic('recovery-fixture.json',{checkpoint:c});
 }});};
 await assert.rejects(()=>startAllocation({rpcUrl:'http://127.0.0.1:1',program,wallet:client.options.wallet},[{label:'Invalid',weight:0}],checkpointFile,500000n),/positive/);assert.deepEqual(counts,{signs:0,sends:0,quotes:0});
 const pending=startAllocation({rpcUrl:'http://127.0.0.1:1',program,wallet:client.options.wallet},applicants,checkpointFile,500000n);
 applicants[0].label='MUTATED AFTER CALL';applicants[0].weight=99;
 await assert.rejects(()=>pending,error=>{assert.ok(error instanceof RecoverableRequestError);assert.equal(error.checkpoint,captured);assert.equal(error.broadcastAttempted,phase==='start');return true;});
 assert.equal(counts.signs,1);assert.equal(counts.sends,phase==='start'?1:0);
 await atomic(phase+'-receipt.json',{...counts,checkpointBeforeSend:true,broadcastAttempted:phase==='start',immutableFixedInput:true});
 if(phase==='start')process.exit(23); // Intentionally terminate the interrupted caller; no returned record is saved.
}else if(phase==='recover'){
 const saved=await parseRecoveryCheckpoint(await readFile(checkpointFile,'utf8'));
 const c=new QVRFClient({rpcUrl:'http://127.0.0.1:1',program}); // Deliberately has no wallet or quote URL.
 const configAddress=await c.configAddress(),key=await c.requestAddress(2n);
 let mode='fulfilled';const output=hex(await hash(enc.encode('qentra-solana-v1'),pub(key),bytes(saved.userContribution),bytes(contribution),bytes(saved.inputDigest)));
 const record=()=>({config:address(configAddress),sequence:2n,requester:address(saved.requester),userContribution:bytes(saved.userContribution),root:bytes(root),numHashes:1,inputDigest:bytes(saved.inputDigest),output:mode==='fulfilled'?bytes(output):new Uint8Array(32),contribution:mode==='fulfilled'?bytes(contribution):new Uint8Array(32),fee:500000n,requestedAt:1792627200n,status:mode==='fulfilled'?2:mode==='request-expired'?3:1,bump:255,inputs:enc.encode(JSON.stringify(saved.input))});
 const event=async(name,r)=>'Program data: '+Buffer.from(new Uint8Array([...(await hash(enc.encode('event:'+name))).slice(0,8),...getRequestRecordEncoder().encode(r).slice(8)])).toString('base64');
 const tx=async signature=>{
  if(mode==='missing'||mode==='expired'||mode==='failed')return null;
  if(signature===saved.signature)return {meta:{err:null,logMessages:[`Program ${program} invoke [1]`,await event('RequestPublished',{...record(),status:1,output:new Uint8Array(32),contribution:new Uint8Array(32)}),`Program ${program} success`]},transaction:{message:{accountKeys:[saved.requester,key,program],instructions:[{programIdIndex:2,accounts:[0,1]}]}}};
  return {meta:{err:null,logMessages:[`Program ${program} invoke [1]`,await event(mode==='request-expired'?'ExpirationPublished':'RevealPublished',record()),`Program ${program} success`]},transaction:{message:{accountKeys:[saved.requester,key,program],instructions:[{programIdIndex:2,accounts:[0,1]}]}}};
 };
 const reveal=getBase58Decoder().decode(new Uint8Array(64).fill(8));
 c.rpc={
  getGenesisHash:()=>response(network),getSignatureStatuses:()=>response({value:[mode==='failed'?{err:{InstructionError:[0,'InvalidArgument']},confirmationStatus:'confirmed'}:mode==='missing'||mode==='expired'?null:{err:null,confirmationStatus:'confirmed'}]}),getBlockHeight:()=>response(mode==='expired'?1000n:100n),
  getAccountInfo:keyArg=>response({value:keyArg===configAddress?{owner:program,data:[Buffer.from(getConfigEncoder().encode(config(saved.requester))).toString('base64'),'base64']}:null}),
  getSignaturesForAddress:keyArg=>response(keyArg===configAddress||mode==='missing'||mode==='expired'||mode==='failed'?[]:(mode==='pending'?[{signature:saved.signature,slot:100n,err:null}]:[{signature:reveal,slot:101n,err:null},{signature:saved.signature,slot:100n,err:null}])),
  getTransaction:(sig,options)=>({send:async()=>options.encoding==='jsonParsed'?{meta:{err:null},transaction:{message:{accountKeys:[{pubkey:saved.requester,signer:true}],instructions:[{programId:SYSTEM_PROGRAM,parsed:{type:'transfer',info:{source:saved.requester,destination:saved.recipient,lamports:500000}}},{programId:MEMO_PROGRAM,parsed:paymentMemo(key)},{programId:program,accounts:[key]}]}}}:await tx(sig)}),
  sendTransaction:()=>{counts.sends++;throw Error('Recovery must never submit');}
 };
 const originalRecover=QVRFClient.prototype.recoverRequest;
 QVRFClient.prototype.recoverRequest=function(checkpoint){this.rpc=c.rpc;return originalRecover.call(this,checkpoint);};
 const application=await reopenAllocation({rpcUrl:'http://127.0.0.1:1',program},applicants,checkpointFile,'decision.json');
 assert.equal(application.state,'fulfilled');assert.equal(application.decision.selected,application.decision.proof.mapping.result);
 assert.deepEqual(await readAllocationDecision('decision.json',applicants,checkpointFile),application.decision);
 for(const mutate of [d=>{d.selected='Other';},d=>{d.proof.input.mapping.items[0]='Other';},d=>{d.proof.input.mapping.weights[0]=99;},d=>{d.requestId='other';}]){const d=structuredClone(application.decision);mutate(d);await atomic('tampered-decision.json',d);await assert.rejects(()=>readAllocationDecision('tampered-decision.json',applicants,checkpointFile));}
 await assert.rejects(()=>reopenAllocation({rpcUrl:'http://127.0.0.1:1',program},[{label:'Other',weight:1},...applicants.slice(1)],checkpointFile,'wrong.json'),/rules/);
 await assert.rejects(()=>reopenAllocation({rpcUrl:'http://127.0.0.1:1',program},[{label:'Amber',weight:99},...applicants.slice(1)],checkpointFile,'wrong.json'),/rules/);
 for(const bad of [[{label:'A',weight:0}],[{label:'A',weight:-1}],[{label:'A',weight:1.5}],[{label:'A',weight:1},{label:'A',weight:2}],[]])await assert.rejects(()=>allocationInput(bad));
 const result=await c.recoverRequest(saved);assert.equal(result.state,'fulfilled');assert.equal(result.record.requestTx,saved.signature);assert.equal(result.record.paymentVerified,true);
 const proof=await exportProofFile(result.record),offline=await verifyProofFile(await parseProofFile(proof));assert.deepEqual(offline.mapping,result.record.mapping);await writeFile('recovered-proof.json',proof);
 const states={};for(const state of ['pending','missing','failed','expired','request-expired']){mode=state;const r=await c.recoverRequest(saved);states[state]={state:r.state,scope:r.scope};const nonaction=await reopenAllocation({rpcUrl:'http://127.0.0.1:1',program},applicants,checkpointFile,'must-not-exist.json');assert.equal(nonaction.decision,undefined);await assert.rejects(()=>readFile('must-not-exist.json')); assert.equal(r.state,state==='missing'?'pending':state==='request-expired'?'expired':state);}
 mode='fulfilled';
 for(const patch of [{network:program,id:`solana:${program}:${program}:2`},{program:SYSTEM_PROGRAM,id:`solana:${network}:${SYSTEM_PROGRAM}:2`},{requestAddress:program},{sequence:'3',id:`solana:${network}:${program}:3`},{input:{...saved.input,mapping:{...saved.input.mapping,items:['Other','Birch','Cedar']}}},{requester:program},{signature:reveal}])await assert.rejects(()=>c.recoverRequest({...saved,...patch}));
 const changedInput={...saved.input,mapping:{...saved.input.mapping,items:['Other','Birch','Cedar']}};const changedDigest=hex(await hash(enc.encode(JSON.stringify(changedInput))));await assert.rejects(()=>c.recoverRequest({...saved,input:changedInput,inputDigest:changedDigest}),/binding changed/);
 assert.deepEqual(counts,{signs:0,sends:0,quotes:0});
 await atomic('recovery-receipt.json',{freshProcess:true,walletAbsent:true,...counts,sameDraw:saved.id,sameSignature:saved.signature,paymentVerified:true,proofVerified:true,mapping:offline.mapping,states,bindingRejections:8,application,tamperedDecisionsRejected:4,invalidApplicantRulesRejected:5});
}else{
 assert.equal(await child('persistence-failure'),0);assert.equal(await child('start'),23);assert.equal(await child('recover'),0);
 const start=JSON.parse(await readFile('start-receipt.json')),recovery=JSON.parse(await readFile('recovery-receipt.json'));
 await atomic('interrupted-draw-receipt.json',{initial:start,recovery,persistenceFailure:JSON.parse(await readFile('persistence-failure-receipt.json'))});
 await atomic('allocation-receipt.json',{initial:start,recovery,persistenceFailure:JSON.parse(await readFile('persistence-failure-receipt.json'))});
 console.log(JSON.stringify({allocationRecipe:true,initialSigns:start.signs,initialSends:start.sends,recoverySigns:recovery.signs,recoverySends:recovery.sends,sameDraw:recovery.sameDraw,proofVerified:true}));
}
