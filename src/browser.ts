import { digest, hex, mapOutput, type MappingConfig, type Repository, type RequestRecord } from '@qentra/core';
export { IndexedDBRepository, MemoryRepository, validateRecord, mapOutput } from '@qentra/core';
export type { MappingConfig, Mapping, RequestRecord, Repository } from '@qentra/core';
export interface EntropyAdapter {
  id: 'qentra-browser-v1'; sourceMode: 'browser-cryptographic';
  request(bytes: number): Promise<string>;
}
export class BrowserEntropyAdapter implements EntropyAdapter {
  readonly id = 'qentra-browser-v1'; readonly sourceMode = 'browser-cryptographic';
  async request(bytes: number) {
    if (!Number.isInteger(bytes) || bytes < 16 || bytes > 4096) throw new Error('Request 16–4096 bytes');
    return hex(crypto.getRandomValues(new Uint8Array(bytes)));
  }
}
export class QVRFClient {
  private listeners = new Map<string, Set<(record: RequestRecord) => void>>();
  private current = new Map<string, RequestRecord>();
  readonly helpers = {
    uniformInt: (bytes: string, min: number, max: number) => mapOutput(bytes, { kind: 'uniformInt', min, max }),
    shuffle: (bytes: string, items: string[]) => mapOutput(bytes, { kind: 'shuffle', items }),
    weightedPick: (bytes: string, items: string[], weights: number[]) => mapOutput(bytes, { kind: 'weightedPick', items, weights }),
    pickUnique: (bytes: string, items: string[], count: number) => mapOutput(bytes, { kind: 'pickUnique', items, count }),
  };
  storageError: string | undefined = undefined;
  constructor(private options: { adapter: EntropyAdapter; repository: Repository }) {}
  private async publish(record: RequestRecord) {
    this.current.set(record.id, structuredClone(record));
    try { await this.options.repository.put(record); this.storageError = undefined; }
    catch { this.storageError = 'History could not be saved in this browser. Copy or export the result before leaving.'; }
    for (const listener of this.listeners.get(record.id) ?? []) listener(structuredClone(record));
  }
  async request(input: { bytes: number }): Promise<RequestRecord> {
    if (!Number.isInteger(input.bytes) || input.bytes < 16 || input.bytes > 4096) throw new Error('Request 16–4096 bytes');
    const at = new Date().toISOString();
    const record: RequestRecord = {
      schemaVersion: 1, id: crypto.randomUUID(), createdAt: at, updatedAt: at,
      adapterId: this.options.adapter.id, sourceMode: this.options.adapter.sourceMode,
      input: { bytes: input.bytes }, inputDigest: await digest(JSON.stringify({ bytes: input.bytes })),
      state: 'created', verification: 'not-applicable', delivery: 'not-requested', events: [{ at, state: 'created' }],
    };
    await this.publish(record);
    // Scheduling starts generation only after the caller can subscribe to this ID.
    setTimeout(() => { void this.generate(record); }, 0);
    return structuredClone(record);
  }
  private async generate(record: RequestRecord) {
    const transition = async (state: RequestRecord['state']) => {
      record.state = state; record.updatedAt = new Date().toISOString();
      record.events.push({ at: record.updatedAt, state }); await this.publish(record);
    };
    await transition('generating');
    try { record.outputBytes = await this.options.adapter.request(record.input.bytes); await transition('produced'); }
    catch (error) { record.error = error instanceof Error ? error.message : 'Generation failed'; await transition('failed'); }
  }
  async getRequest(id: string) { return this.current.has(id) ? structuredClone(this.current.get(id)!) : this.options.repository.get(id); }
  subscribe(id: string, listener: (record: RequestRecord) => void) {
    const group = this.listeners.get(id) ?? new Set(); group.add(listener); this.listeners.set(id, group);
    return () => { group.delete(listener); if (!group.size) this.listeners.delete(id); };
  }
  async waitForResult(id: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<RequestRecord> {
    if (options.signal?.aborted) throw new Error('Request wait aborted');
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (record?: RequestRecord, error?: Error) => {
        if (done) return; done = true; unsubscribe(); clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
        error ? reject(error) : resolve(record!);
      };
      const inspect = (record: RequestRecord) => {
        if (record.state === 'produced') finish(record);
        else if (record.state === 'failed') finish(undefined, new Error(record.error ?? 'Generation failed'));
      };
      const unsubscribe = this.subscribe(id, inspect);
      const abort = () => finish(undefined, new Error('Request wait aborted'));
      const timer = setTimeout(() => finish(undefined, new Error('Request wait timed out')), options.timeoutMs ?? 10000);
      options.signal?.addEventListener('abort', abort, { once: true });
      void this.getRequest(id).then(record => record ? inspect(record) : finish(undefined, new Error('Unknown request')), error => finish(undefined, error));
    });
  }
  async applyMapping(id: string, config: MappingConfig) {
    const record = await this.getRequest(id);
    if (!record?.outputBytes || record.state !== 'produced') throw new Error('Wait for a produced request');
    record.mapping = await mapOutput(record.outputBytes, config); record.updatedAt = new Date().toISOString();
    record.events.push({ at: record.updatedAt, state: 'mapped' }); await this.publish(record); return record;
  }
}
