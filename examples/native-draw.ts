import { QVRFClient, verifyProtocolRecord, type ProtocolRecord, type SolanaWallet } from '../src/index.js';
/** Caller owns its wallet adapter and storage; this recipe never constructs a key. */
export async function tournamentDraw(options: { rpcUrl: string; program: string; quoteUrl: string; wallet: SolanaWallet }, save: (record: ProtocolRecord) => Promise<void>) {
 const client = new QVRFClient(options);
 const quote = await client.quote();
 if (!quote.ready) throw Error('Wait for service readiness before payment');
 const requested = await client.request({ bytes: 32, mapping: { kind: 'pickUnique', items: ['Amber', 'Birch', 'Cedar'], count: 1 } }, { expectedFee: quote.amount });
 await save(requested); // Save ID before polling. A pending result is not another payment.
 const result = await client.waitForResult(requested.id);
 await verifyProtocolRecord(result);
 await client.verify(result);
 await save(result);
 return result;
}
export async function reopen(options: { rpcUrl: string; program: string }, id: string) {
 const client = new QVRFClient(options);
 const record = await client.getRequest(id);
 if (record.state === 'fulfilled') await client.verify(record);
 return record;
}
console.log('Native recipe loaded; supply an external wallet explicitly to request a draw.');
