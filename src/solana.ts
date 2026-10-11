import { address, createSolanaRpc, getAddressEncoder,
  getBase64Encoder, getBase58Encoder, getBase64EncodedWireTransaction, createTransactionMessage, setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions, compileTransaction,
  getTransactionEncoder, getTransactionDecoder, getProgramDerivedAddress, AccountRole, type Instruction } from '@solana/kit';
import { getConfigDecoder } from './generated/accounts/config.js';
import { getRequestRecordDecoder } from './generated/accounts/requestRecord.js';
import { getRequestInstructionDataEncoder } from './generated/instructions/request.js';
import { getCommitInstructionDataDecoder } from './generated/instructions/commit.js';
import { getExpireInstructionDataEncoder } from './generated/instructions/expire.js';
import { mapOutput, type MappingConfig, type Mapping } from '@qentra/core';

export const TOKEN_PROGRAM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const SYSTEM_PROGRAM='11111111111111111111111111111111';
export const ZERO=SYSTEM_PROGRAM;
export const MEMO_PROGRAM='MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const paymentMemo=(key:string)=>`QENTRA:request:${key}`;
export const refundMemo=(key:string)=>`QENTRA:refund:${key}`;
export function solTransfer(from:string,to:string,amount:bigint):Instruction {return {programAddress:address(SYSTEM_PROGRAM),accounts:[meta(from,AccountRole.WRITABLE_SIGNER),meta(to,AccountRole.WRITABLE)],data:join(u32(2),u64(amount))};}
export const memoInstruction=(value:string):Instruction=>({programAddress:address(MEMO_PROGRAM),accounts:[],data:enc.encode(value)});
const enc=new TextEncoder();
export const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export const bytes=(value:string)=>{if(!/^[0-9a-f]{64}$/i.test(value))throw Error('Expected 32-byte value');return Uint8Array.from(value.match(/../g)!,x=>parseInt(x,16));};
export const join=(...parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;};
export async function hash(...parts:Uint8Array[]){return new Uint8Array(await crypto.subtle.digest('SHA-256',join(...parts) as BufferSource));}
export const pub=(value:string)=>new Uint8Array(getAddressEncoder().encode(address(value)));
export function u64(value:bigint){const out=new Uint8Array(8);new DataView(out.buffer).setBigUint64(0,value,true);return out;}
export function u32(value:number){const out=new Uint8Array(4);new DataView(out.buffer).setUint32(0,value,true);return out;}
export async function instructionData(name:string,...args:Uint8Array[]){return join((await hash(enc.encode(`global:${name}`))).slice(0,8),...args);}
export const meta=(value:string,role:AccountRole)=>({address:address(value),role});
export { AccountRole };
export type SolanaWallet={address:string;signTransaction:(wire:Uint8Array)=>Promise<Uint8Array>};
export type ProtocolInput={bytes:32;mapping:MappingConfig;serviceQuote?:string};
export type ProtocolRecord={schemaVersion:4;id:string;network:string;contract:string;sequence:string;createdAt:string;
 input:ProtocolInput;inputDigest:string;state:'requested'|'fulfilled'|'expired';verification:'pending'|'verified';
 delivery:'not-requested'|'pending'|'delivered'|'failed';requester:string;feePaid:string;feeQuoted:string;paymentVerified:boolean;recipient:string;userContribution:string;
 providerCommitment:string;numHashes:number;providerContribution?:string|undefined;outputBytes?:string|undefined;
 mapping?:Mapping|undefined;commitmentTx?:string|undefined;requestTx?:string|undefined;revealTx?:string|undefined;deliveryTx?:string|undefined;
 storage?:'events'|'account';requestAddress:string;callbackProgram:string;callbackAccount:string};
export type Config={controller:string;operator:string;recipient:string;fee:bigint;refundSeconds:bigint;next:bigint;root:string;slots:number;used:number;pending:number;batchFirst:bigint;bump:number};
export async function verifyProtocolRecord(r:ProtocolRecord){
 if(r.schemaVersion!==4||r.input.bytes!==32||r.state!=='fulfilled'||!r.providerContribution||!r.outputBytes)throw Error('Wait for a fulfilled Solana request');
 if(r.inputDigest!==hex(await hash(enc.encode(JSON.stringify(r.input)))))throw Error('Fixed inputs changed');
 if(!Number.isInteger(r.numHashes)||r.numHashes<1||r.numHashes>256)throw Error('Invalid commitment path');
 let root=bytes(r.providerContribution);for(let i=0;i<r.numHashes;i++)root=await hash(root);
 if(hex(root)!==r.providerCommitment)throw Error('Reveal does not match commitment');
 const output=await hash(enc.encode('qentra-solana-v1'),pub(r.requestAddress),bytes(r.userContribution),bytes(r.providerContribution),bytes(r.inputDigest));
 if(hex(output)!==r.outputBytes)throw Error('Output does not match request');
 if(JSON.stringify(await mapOutput(r.outputBytes,r.input.mapping))!==JSON.stringify(r.mapping))throw Error('Application result changed');
}

// Wallet/account discovery follows the inspected external-wallet donors. RPC and
// message encoding use Kit; no keys, upstream responses or custody enter this API.
export class SolanaQVRFClient {
 readonly rpc;readonly program;private network?:string;private commitments=new Map<string,{signature:string;slot:bigint}>();
 constructor(readonly options:{rpcUrl:string;program:string;wallet?:SolanaWallet;symbol?:string;requestStorage?:'legacy';quoteUrl?:string}){this.program=address(options.program);this.rpc=createSolanaRpc(options.rpcUrl);}
 async networkId(){return this.network??=String(await this.rpc.getGenesisHash().send());}
 async configAddress(){return String((await getProgramDerivedAddress({programAddress:this.program,seeds:[enc.encode('config')]}))[0]);}
 async requestAddress(sequence:bigint){return String((await getProgramDerivedAddress({programAddress:this.program,seeds:[enc.encode('request'),pub(await this.configAddress()),u64(sequence)]}))[0]);}
 async account(key:string,name:string){
  const result=await this.rpc.getAccountInfo(address(key),{encoding:'base64',commitment:'confirmed'}).send();
  if(!result.value||result.value.owner!==this.program)throw Error('Request program account not found');
  const data=new Uint8Array(getBase64Encoder().encode(result.value.data[0]));
  if(hex(data.slice(0,8))!==hex((await hash(enc.encode(`account:${name}`))).slice(0,8)))throw Error('Unexpected account type');return data;
 }
 async config():Promise<Config>{const r=getConfigDecoder().decode(await this.account(await this.configAddress(),'Config'));return {...r,root:hex(new Uint8Array(r.root))};}
 async streamAddress(){return String((await getProgramDerivedAddress({programAddress:this.program,seeds:[enc.encode('stream'),pub(await this.configAddress())]}))[0]);}
 async streamReady(){const r=await this.rpc.getAccountInfo(address(await this.streamAddress()),{encoding:'base64',commitment:'confirmed'}).send();if(!r.value)return false;if(r.value.owner!==this.program)throw Error('Unexpected shared workspace owner');await this.account(await this.streamAddress(),'RequestRecord');return true;}
 async initializeStream(){const c=await this.config();const payer=this.options.wallet?.address;if(payer!==c.controller&&payer!==c.operator)throw Error('Project controller or keeper must initialize the shared workspace');return this.send({programAddress:this.program,accounts:[meta(payer!,AccountRole.WRITABLE_SIGNER),meta(await this.configAddress(),AccountRole.READONLY),meta(await this.streamAddress(),AccountRole.WRITABLE),meta(SYSTEM_PROGRAM,AccountRole.READONLY)],data:await instructionData('initialize_stream')});}
 async serviceQuote(requester?:string,sequence?:bigint){
  if(!this.options.quoteUrl)return undefined;
  const response=await fetch(this.options.quoteUrl,{method:requester?'POST':'GET',cache:'no-store',...(requester?{headers:{'Content-Type':'application/json'},body:JSON.stringify({program:this.program,requester,sequence:String(sequence)})}:{})});
  if(!response.ok)throw Error('Service pricing is not active; retry after activation');
  const q=await response.json();const c=await this.config();
  if(q.program!==this.program||q.recipient!==c.recipient||!/^\d+$/.test(q.amount)||BigInt(q.amount)<=0n||BigInt(q.amount)>18446744073709551615n)throw Error('Invalid service price quote');
  if(requester&&(q.requester!==requester||q.sequence!==String(sequence)||q.requestAddress!==await this.requestAddress(sequence!)||!/^[-a-zA-Z0-9]{36}$/.test(q.id)||!Number.isSafeInteger(q.expiresAt)||q.expiresAt<=Math.floor(Date.now()/1000)))throw Error('Service quote binding expired or changed');
  return q as {program:string;amount:string;recipient:string;id:string;requester:string;sequence:string;requestAddress:string;expiresAt:number};
 }
 async quote(){if(!this.options.quoteUrl&&await this.networkId()==='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Configure the service quote URL for mainnet pricing');const c=await this.config(),noRequestRent=await this.streamReady(),q=await this.serviceQuote();return {amount:q?BigInt(q.amount):c.fee,recipient:c.recipient,symbol:'SOL',decimals:9,capacity:BigInt(c.slots-c.used),noRequestRent,ready:noRequestRent&&c.pending===0};}
 async approveFee(){if(!this.options.wallet)throw Error('Connect your wallet');return this.quote();}
 async send(instruction:Instruction|Instruction[],wallet=this.options.wallet){
  if(!wallet)throw Error('Connect your wallet');
  const latest=(await this.rpc.getLatestBlockhash({commitment:'confirmed'}).send()).value;
  const message=appendTransactionMessageInstructions(Array.isArray(instruction)?instruction:[instruction],setTransactionMessageLifetimeUsingBlockhash(latest,setTransactionMessageFeePayer(address(wallet.address),createTransactionMessage({version:0}))));
  const compiled=compileTransaction(message);const wire=new Uint8Array(getTransactionEncoder().encode(compiled));
  const simulation=await this.rpc.simulateTransaction(getBase64EncodedWireTransaction(compiled),{encoding:'base64',sigVerify:false,replaceRecentBlockhash:true,commitment:'confirmed'}).send();
  if(simulation.value.err)throw Error(`Transaction check failed: ${JSON.stringify(simulation.value.err,(_,value)=>typeof value==='bigint'?String(value):value)}`);
  const signed=await wallet.signTransaction(wire);const decoded=getTransactionDecoder().decode(signed);
  if(hex(new Uint8Array(decoded.messageBytes))!==hex(new Uint8Array(compiled.messageBytes)))throw Error('Wallet changed the prepared request');
  if(hex(new Uint8Array(getTransactionEncoder().encode(decoded)))!==hex(signed))throw Error('Transaction codec changed the signed bytes');
  const signature=await this.rpc.sendTransaction(getBase64EncodedWireTransaction(decoded),{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed'}).send();
  const deadline=Date.now()+90000;
  while(Date.now()<deadline){const status=(await this.rpc.getSignatureStatuses([signature],{searchTransactionHistory:true}).send()).value[0];if(status?.err)throw Error(`Transaction failed: ${JSON.stringify(status.err)}`);if(status&&['confirmed','finalized'].includes(status.confirmationStatus??''))return String(signature);if(await this.rpc.getBlockHeight({commitment:'confirmed'}).send()>latest.lastValidBlockHeight)throw Error(`Transaction expired; inspect ${signature} before another request`);await new Promise(resolve=>setTimeout(resolve,500));}
  throw Error(`Confirmation pending: ${signature}; reopen without resubmitting`);
 }
 async request(input:ProtocolInput,options:{expectedFee?:bigint}={}){
  if(input.bytes!==32)throw Error('Request 32 bytes');await mapOutput('00'.repeat(32),input.mapping);
  const c=await this.config();if(c.used>=c.slots)throw Error('No committed capacity');const wallet=this.options.wallet;if(!wallet)throw Error('Connect your wallet');
  if(await this.networkId()==='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'&&!this.options.quoteUrl)throw Error('Configure the service quote URL for mainnet requests');
  const q=await this.serviceQuote(wallet.address,c.next),fee=q?BigInt(q.amount):c.fee;
  if(options.expectedFee!==undefined&&fee!==options.expectedFee)throw Error('Service price changed; review the refreshed quote before signing');
  const fixedInput:ProtocolInput=q?{bytes:input.bytes,mapping:input.mapping,serviceQuote:q.id}:input;
  const encoded=enc.encode(JSON.stringify(fixedInput));if(encoded.length>512)throw Error('Use application rules under 512 bytes');
  const key=await this.requestAddress(c.next),R=AccountRole;
  const eventMode=this.options.requestStorage!=='legacy';
  if(eventMode&&(!await this.streamReady()||c.pending!==0))throw Error('No-rent workspace is not ready; wait for the current draw or project activation');
  const contribution=crypto.getRandomValues(new Uint8Array(32));
  const proof:Instruction=eventMode?{programAddress:this.program,accounts:[meta(wallet.address,R.READONLY_SIGNER),meta(await this.configAddress(),R.WRITABLE),meta(await this.streamAddress(),R.WRITABLE),meta(key,R.READONLY)],data:await instructionData('request_event',u64(c.next),u32(encoded.length),encoded,contribution,u64(fee),bytes(c.root))}:{programAddress:this.program,accounts:[meta(wallet.address,R.WRITABLE_SIGNER),meta(await this.configAddress(),R.WRITABLE),meta(key,R.WRITABLE),meta(SYSTEM_PROGRAM,R.READONLY)],data:getRequestInstructionDataEncoder().encode({sequence:c.next,inputs:encoded,userContribution:contribution,quotedFee:fee,quotedRoot:bytes(c.root)})};
  // Standard SOL payment and indexed identity share one user signature; the
  // identity is read-only in event mode and never creates a per-draw account.
  const signature=await this.send([solTransfer(wallet.address,c.recipient,fee),memoInstruction(paymentMemo(key)),proof]);
  const r=await this.getRequest(c.next);r.requestTx=signature;return r;
 }
 private async sequence(value:bigint|string){if(typeof value==='string')value=decodeURIComponent(value);if(typeof value==='string'&&value.includes(':')){const [prefix,network,program,seq,...rest]=value.split(':');if(prefix!=='solana'||rest.length||network!==await this.networkId()||program!==this.program||!/^\d+$/.test(seq??''))throw Error('Request belongs to another network or program');return BigInt(seq!);}return BigInt(value);}
 async getRequest(value:bigint|string):Promise<ProtocolRecord>{
  const seq=await this.sequence(value),key=await this.requestAddress(seq);
  const info=await this.rpc.getAccountInfo(address(key),{encoding:'base64',commitment:'confirmed'}).send();
  const history=info.value?.owner===this.program?undefined:await this.eventRecord(seq,key);
  const r=history?.record??getRequestRecordDecoder().decode(await this.account(key,'RequestRecord'));
  if(r.config!==await this.configAddress()||r.sequence!==seq)throw Error('Request identity mismatch');
  const {requester,numHashes,fee,status}=r;
  const c=await this.config();
  const userContribution=hex(new Uint8Array(r.userContribution)),root=hex(new Uint8Array(r.root)),inputDigest=hex(new Uint8Array(r.inputDigest)),output=hex(new Uint8Array(r.output)),contribution=hex(new Uint8Array(r.contribution)),timestamp=r.requestedAt;
  if(r.inputs.length>512)throw Error('Invalid request input length');
  const input=JSON.parse(new TextDecoder().decode(new Uint8Array(r.inputs))) as ProtocolInput;
  if(![1,2,3].includes(status)||input.bytes!==32)throw Error('Invalid request state');
  const network=await this.networkId();
  const result:ProtocolRecord={schemaVersion:4,id:`solana:${network}:${this.program}:${seq}`,network,contract:this.program,sequence:String(seq),createdAt:new Date(Number(timestamp)*1000).toISOString(),input,inputDigest,state:status===2?'fulfilled':status===3?'expired':'requested',verification:'pending',delivery:'not-requested',requester,feePaid:'0',feeQuoted:String(fee),paymentVerified:false,recipient:c.recipient,userContribution,providerCommitment:root,numHashes,storage:history?'events':'account',requestAddress:key,callbackProgram:ZERO,callbackAccount:ZERO};
  if(inputDigest!==hex(await hash(enc.encode(JSON.stringify(input)))))throw Error('Fixed request rules do not match');
  if(status===2){result.providerContribution=contribution;result.outputBytes=output;result.mapping=await mapOutput(output,input.mapping);await verifyProtocolRecord(result);result.verification='verified';}
  const signatures=await this.rpc.getSignaturesForAddress(address(key),{limit:8,commitment:'confirmed'}).send();
  const successful=signatures.filter(x=>!x.err).reverse();result.requestTx=history?.requestTx??successful[0]?.signature;result.revealTx=history?.revealTx;
  for(const item of history?[]:successful.slice(1)){const tx=await this.rpc.getTransaction(item.signature,{encoding:'json',maxSupportedTransactionVersion:0,commitment:'confirmed'}).send();if(tx?.meta?.logMessages?.some(x=>x.includes('Instruction: Fulfill')))result.revealTx=item.signature;}
  if(result.requestTx){
   const requestSlot=history?.requestSlot??successful[0]!.slot;
   if(!this.commitments.has(root)){
    const commits=await this.rpc.getSignaturesForAddress(address(await this.configAddress()),{limit:64,commitment:'confirmed'}).send();
    for(const item of commits){if(item.err||item.slot>requestSlot)continue;
     const tx:any=await this.rpc.getTransaction(item.signature,{encoding:'json',maxSupportedTransactionVersion:0,commitment:'confirmed'}).send();
     if(!tx?.meta?.logMessages?.some((x:string)=>x.includes('Instruction: Commit')))continue;
     for(const ix of tx.transaction.message.instructions){if(tx.transaction.message.accountKeys[ix.programIdIndex]!==this.program)continue;
      try{const raw=new Uint8Array(getBase58Encoder().encode(ix.data));if(hex(raw.slice(0,8))!==hex((await hash(enc.encode('global:commit'))).slice(0,8)))continue;const data=getCommitInstructionDataDecoder().decode(raw);const committed=hex(new Uint8Array(data.root));if(committed===root)this.commitments.set(root,{signature:item.signature,slot:item.slot});}catch{/* another instruction in the same transaction */}
     }
     if(this.commitments.has(root))break;
    }
   }
   const committed=this.commitments.get(root);if(committed&&committed.slot<=requestSlot)result.commitmentTx=committed.signature;
  }
  if(result.requestTx){try{await this.verifyPayment(result);result.paymentVerified=true;result.feePaid=result.feeQuoted;}catch{/* Unpaid proofs never become paid service requests. */}}
  return result;
 }
 // Only decode data emitted while this program is executing, never an inner
 // program's lookalike log. Successful chain transactions remain authoritative.
 private async eventRecord(seq:bigint,key:string){
  const signatures=await this.rpc.getSignaturesForAddress(address(key),{limit:8,commitment:'confirmed'}).send();
  let record:ReturnType<ReturnType<typeof getRequestRecordDecoder>['decode']>|undefined,requestTx:string|undefined,revealTx:string|undefined,requestSlot:bigint|undefined;
  const tags=await Promise.all(['RequestPublished','RevealPublished','ExpirationPublished'].map(async name=>hex((await hash(enc.encode(`event:${name}`))).slice(0,8))));
  for(const item of signatures.filter(x=>!x.err).reverse()){
   const tx:any=await this.rpc.getTransaction(item.signature,{encoding:'json',maxSupportedTransactionVersion:0,commitment:'confirmed'}).send();
   if(!tx?.meta||tx.meta.err)continue;
   const keys=[...tx.transaction.message.accountKeys,...(tx.meta.loadedAddresses?.writable??[]),...(tx.meta.loadedAddresses?.readonly??[])];
   if(!keys.includes(key)||!tx.transaction.message.instructions.some((ix:any)=>keys[ix.programIdIndex]===this.program&&ix.accounts.some((i:number)=>keys[i]===key)))continue;
   const stack:string[]=[];
   for(const log of tx.meta.logMessages??[]){
    const invoke=/^Program (\S+) invoke \[\d+\]$/.exec(log);if(invoke){stack.push(invoke[1]!);continue;}
    const done=/^Program (\S+) (?:success|failed:)/.exec(log);if(done){if(stack.at(-1)===done[1])stack.pop();continue;}
    if(stack.at(-1)!==this.program||!log.startsWith('Program data: '))continue;
    const raw=new Uint8Array(getBase64Encoder().encode(log.slice(14))),tag=tags.indexOf(hex(raw.slice(0,8)));if(tag<0)continue;
    const decoded=getRequestRecordDecoder().decode(join((await hash(enc.encode('account:RequestRecord'))).slice(0,8),raw.slice(8)));
    if(decoded.config!==await this.configAddress()||decoded.sequence!==seq)throw Error('Event request identity mismatch');
    if(tag===0){if(requestTx||decoded.status!==1)throw Error('Duplicate or invalid request event');requestTx=item.signature;requestSlot=item.slot;record=decoded;}
    else{if(!record||!requestTx||decoded.status!==(tag===1?2:3))throw Error('Event lifecycle mismatch');
     for(const field of ['sequence','requester','requestedAt','numHashes','fee'] as const)if(decoded[field]!==record[field])throw Error('Event request binding changed');
     for(const field of ['inputs','root','userContribution','inputDigest'] as const)if(hex(new Uint8Array(decoded[field]))!==hex(new Uint8Array(record[field])))throw Error('Event input binding changed');
     if(record.status!==1)throw Error('Duplicate terminal event');record=decoded;if(tag===1)revealTx=item.signature;
    }
   }
  }
  if(!record||!requestTx||requestSlot===undefined)throw Error('Historical request proof unavailable from this RPC; use an archive-capable RPC or saved proof');
  return {record,requestTx,revealTx,requestSlot};
 }
 async verify(record:ProtocolRecord){await verifyProtocolRecord(record);const actual=await this.getRequest(record.id);for(const field of ['id','network','contract','sequence','createdAt','requester','feePaid','feeQuoted','paymentVerified','recipient','userContribution','providerCommitment','numHashes','providerContribution','inputDigest','outputBytes','state','delivery','requestAddress','callbackProgram','callbackAccount'] as const)if(record[field]!==actual[field])throw Error(`Onchain ${field} mismatch`);if(JSON.stringify(record.mapping)!==JSON.stringify(actual.mapping))throw Error('Application result mismatch');return true;}
 async listRequests(){const c=await this.config();const out:ProtocolRecord[]=[];for(let seq=c.next-1n;seq>=1n&&out.length<64;seq--)out.push(await this.getRequest(seq));return out;}
 subscribe(value:bigint|string,onUpdate:(record:ProtocolRecord)=>void){let stopped=false,timer:ReturnType<typeof setTimeout>;const poll=async()=>{try{const r=await this.getRequest(value);if(!stopped)onUpdate(r);}finally{if(!stopped)timer=setTimeout(()=>{void poll().catch(()=>{});},1500);}};void poll().catch(()=>{});return()=>{stopped=true;clearTimeout(timer);};}
 async waitForResult(value:bigint|string,options:{timeoutMs?:number;signal?:AbortSignal}={}){const deadline=Date.now()+(options.timeoutMs??120000);while(Date.now()<deadline){if(options.signal?.aborted)throw Error('Wait aborted');const r=await this.getRequest(value);if(r.state==='fulfilled')return r;if(r.state==='expired')throw Error('Request expired; refund status is in the payment receipt');await new Promise(resolve=>setTimeout(resolve,1000));}throw Error('Request pending; reopen its ID without another payment');}
 // Receipt check: confirmed successful transaction, exact transfer, signer and memo.
 async verifyTransfer(signature:string,from:string,to:string,amount:bigint,memo:string,requestAddress?:string){
  const tx:any=await this.rpc.getTransaction(signature as any,{encoding:'jsonParsed',maxSupportedTransactionVersion:0,commitment:'confirmed'}).send();
  if(!tx||!tx.meta||tx.meta.err)throw Error('Payment transaction is absent or failed');
  const keys=tx.transaction.message.accountKeys;
  if(!keys.some((x:any)=>String(x.pubkey)===from&&x.signer))throw Error('Payment sender did not sign');
  const instructions=tx.transaction.message.instructions;
  let total=0n;for(const ix of instructions){if(String(ix.programId)===SYSTEM_PROGRAM&&ix.parsed?.type==='transfer'&&ix.parsed.info?.source===from&&ix.parsed.info.destination===to)total+=BigInt(ix.parsed.info.lamports);}
  if(total!==amount)throw Error('Payment amount or recipient does not match the request');
  const memos=instructions.filter((x:any)=>String(x.programId)===MEMO_PROGRAM);
  if(memos.length!==1||memos[0].parsed!==memo)throw Error('Payment receipt belongs to another request');
  if(requestAddress&&!instructions.some((x:any)=>String(x.programId)===this.program&&x.accounts?.includes(requestAddress)))throw Error('Payment and proof request must share the same transaction');
  return true;
 }
 async verifyPayment(record:ProtocolRecord){if(!record.requestTx)throw Error('Request transaction missing');return this.verifyTransfer(record.requestTx,record.requester,record.recipient,BigInt(record.feeQuoted),paymentMemo(record.requestAddress),record.requestAddress);}
 async expire(value:bigint|string){const r=await this.getRequest(value);if(r.storage==='events'){const wallet=this.options.wallet;if(!wallet)throw Error('Connect your wallet');return this.send({programAddress:this.program,accounts:[meta(wallet.address,AccountRole.READONLY_SIGNER),meta(await this.configAddress(),AccountRole.WRITABLE),meta(await this.streamAddress(),AccountRole.WRITABLE),meta(r.requestAddress,AccountRole.READONLY)],data:await instructionData('expire_event',u64(BigInt(r.sequence)))});}return this.send({programAddress:this.program,accounts:[meta(await this.configAddress(),AccountRole.WRITABLE),meta(r.requestAddress,AccountRole.WRITABLE)],data:getExpireInstructionDataEncoder().encode({})});}
}
