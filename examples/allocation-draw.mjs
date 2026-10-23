import { readFile, open, link, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { QVRFClient, parseRecoveryCheckpoint, mapOutput, exportProofFile, parseProofFile, verifyProofFile } from '@qentra/sdk';

/** Ordered labels identify eligible applicants; weights are relative integer ticket counts. */
export async function allocationInput(applicants) {
 const fixed=structuredClone(applicants);
 if(!Array.isArray(fixed)||fixed.some(a=>!a||typeof a.label!=='string'||!Number.isSafeInteger(a.weight)||a.weight<=0))throw Error('Each eligible applicant needs a label and a positive integer weight');
 const mapping={kind:'weightedPick',items:fixed.map(a=>a.label),weights:fixed.map(a=>a.weight)};
 if(new Set(mapping.items).size!==mapping.items.length)throw Error('Applicant labels must be distinct');
 // Reuse the mapper for its bounds/label/total validation; this value is never a draw result.
 await mapOutput('00'.repeat(32),mapping);
 return {bytes:32,mapping};
}

/** Exclusive creation protects an earlier draw; sync before publishing the checkpoint name. */
async function saveNew(file,text) {
 const temporary=file+'.tmp'; const handle=await open(temporary,'wx',0o600);
 try {await handle.writeFile(text);await handle.sync();} finally {await handle.close();}
 try {await link(temporary,file);} finally {await unlink(temporary);}
 const directory=await open(dirname(file),'r');
 try {await directory.sync();} finally {await directory.close();}
 // Choose a filesystem with durable hard links + sync; host replication is caller-owned.
}

/** Call only after the caller approves the quote and external-wallet signing action. */
export async function startAllocation(options, applicants, checkpointFile, expectedFee) {
 const input=await allocationInput(applicants);
 const client=new QVRFClient(options);
 return client.request(input,{expectedFee,checkpoint:async checkpoint=>{
  await saveNew(checkpointFile,JSON.stringify(checkpoint,null,2)+'\n');
 }});
}

function same(a,b,message) {if(JSON.stringify(a)!==JSON.stringify(b))throw Error(message);}
async function boundProof(proof,applicants,checkpoint) {
 const expected=await allocationInput(applicants);
 const saved=await parseRecoveryCheckpoint(JSON.stringify(checkpoint));
 same(saved.input.mapping,expected.mapping,'Saved applicant rules do not match approved rules');
 const record=await parseProofFile(typeof proof==='string'?proof:JSON.stringify(proof));
 const verified=await verifyProofFile(record);
 same(record.input,saved.input,'Proof input does not match saved request');
 for(const [field,value] of Object.entries({id:saved.id,network:saved.network,contract:saved.program,requestAddress:saved.requestAddress,requester:saved.requester,requestTx:saved.signature,sequence:saved.sequence,inputDigest:saved.inputDigest,userContribution:saved.userContribution,providerCommitment:saved.providerCommitment,recipient:saved.recipient,feeQuoted:saved.feeQuoted,storage:saved.storage})){
  if(record[field]!==value)throw Error('Proof request binding changed: '+field);
 }
 return {record,verified};
}

/** Readback is offline integrity + caller-held request/rule binding, not a fresh chain read. */
export async function readAllocationDecision(decisionFile,applicants,checkpointFile) {
 const checkpoint=await parseRecoveryCheckpoint(await readFile(checkpointFile,'utf8'));
 const decision=JSON.parse(await readFile(decisionFile,'utf8'));
 const {record,verified}=await boundProof(decision.proof,applicants,checkpoint);
 if(decision.requestId!==record.id||decision.inputDigest!==record.inputDigest||decision.selected!==verified.mapping.result)throw Error('Application decision differs from verified proof');
 return decision;
}

/** Reopen in a fresh process with rpc/program only. No wallet, quote, signing or resubmission. */
export async function reopenAllocation(options, applicants, checkpointFile, decisionFile) {
 // Capture caller rules before asynchronous RPC; never choose them after observing the output.
 const input=await allocationInput(applicants);
 const fixed=input.mapping.items.map((label,i)=>({label,weight:input.mapping.weights[i]}));
 const checkpoint=await parseRecoveryCheckpoint(await readFile(checkpointFile,'utf8'));
 same(checkpoint.input.mapping,input.mapping,'Saved applicant rules do not match approved rules');
 const recovered=await new QVRFClient({rpcUrl:options.rpcUrl,program:options.program}).recoverRequest(checkpoint);
 if(recovered.state!=='fulfilled')return {state:recovered.state,scope:recovered.scope};
 const proof=await exportProofFile(recovered.record);
 const {record,verified}=await boundProof(proof,fixed,checkpoint);
 const decision={requestId:record.id,inputDigest:record.inputDigest,selected:verified.mapping.result,proof:JSON.parse(proof)};
 await saveNew(decisionFile,JSON.stringify(decision,null,2)+'\n');
 return {state:'fulfilled',decision:await readAllocationDecision(decisionFile,fixed,checkpointFile)};
}
