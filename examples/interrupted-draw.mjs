import { readFile, writeFile, rename } from 'node:fs/promises';
import { QVRFClient, RecoverableRequestError, parseRecoveryCheckpoint, exportProofFile } from '@qentra/sdk';

/** Caller supplies an external wallet; this module never creates a wallet/key. */
export async function startTournament(options, checkpointFile) {
 const client=new QVRFClient(options),quote=await client.quote();
 if(!quote.ready)throw Error('Wait for service readiness');
 try {
  return await client.request({bytes:32,mapping:{kind:'pickUnique',items:['Amber','Birch','Cedar'],count:1}}, {
   expectedFee:quote.amount,
   checkpoint:async checkpoint=>{
    // Atomic rename is the example's durability boundary. Use storage that survives your process/host.
    // Reserve a distinct path per draw; do not overwrite another draw's only checkpoint.
    await writeFile(checkpointFile+'.tmp',JSON.stringify(checkpoint),{flag:'wx'});
    await rename(checkpointFile+'.tmp',checkpointFile);
   },
  });
 } catch(error) {
  if(error instanceof RecoverableRequestError){
   console.error(error.broadcastAttempted?'Outcome uncertain: reopen this checkpoint without paying again':'Checkpoint failed: no transaction was broadcast');
  }
  throw error;
 }
}

/** Safe to run in a new process without a wallet or quote URL. */
export async function reopenTournament(options, checkpointFile, proofFile) {
 const client=new QVRFClient({rpcUrl:options.rpcUrl,program:options.program});
 const checkpoint=await parseRecoveryCheckpoint(await readFile(checkpointFile,'utf8'));
 const recovered=await client.recoverRequest(checkpoint);
 if(recovered.state==='fulfilled')await writeFile(proofFile,await exportProofFile(recovered.record));
 return recovered;
}
