import { emptyState, type State, type Event } from '../core/model';
export interface Store {
  read(): Promise<State>;
  mutate<T>(fn: (state: State, events: Event[]) => T): Promise<T>;
  events(campaignId: string): Promise<Event[]>;
  draft(value?: unknown): Promise<unknown>;
  deleteCampaign(id: string): Promise<void>;
  clear(): Promise<void>;
}
const request = <T>(req: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
export class Repository implements Store {
  private db: Promise<IDBDatabase>;
  constructor(name = 'zaplista-v1') {
    this.db = new Promise((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => {
        for (const key of ['campaigns', 'recipients', 'events']) open.result.createObjectStore(key, { keyPath: 'id' });
        open.result.createObjectStore('meta');
      };
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
    });
  }
  private async transaction<T>(mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await this.db;
    const tx = db.transaction(['campaigns', 'recipients', 'events', 'meta'], mode);
    const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error || Error('Transação local interrompida.')); });
    try { const value = await fn(tx); await done; return value; }
    catch (err) { try { tx.abort(); } catch { /* already finished */ } await done.catch(() => {}); throw err; }
  }
  private async state(tx: IDBTransaction): Promise<State> {
    const [campaigns, recipients, meta] = await Promise.all([request(tx.objectStore('campaigns').getAll()), request(tx.objectStore('recipients').getAll()), request(tx.objectStore('meta').get('state'))]);
    return { ...emptyState(), ...meta, campaigns, recipients };
  }
  read() { return this.transaction('readonly', tx => this.state(tx)); }
  mutate<T>(fn: (state: State, events: Event[]) => T) {
    return this.transaction('readwrite', async tx => {
      const state = await this.state(tx), events: Event[] = [];
      const value = fn(state, events);
      // The callback is synchronous: no network/DOM await inside the atomic lock.
      for (const c of state.campaigns) tx.objectStore('campaigns').put(c);
      for (const r of state.recipients) tx.objectStore('recipients').put(r);
      for (const e of events) tx.objectStore('events').put(e);
      tx.objectStore('meta').put({ activeId: state.activeId, lease: state.lease, exclusions: state.exclusions }, 'state');
      return value;
    });
  }
  events(id: string) { return this.transaction('readonly', async tx => (await request(tx.objectStore('events').getAll()) as Event[]).filter(e => e.campaignId === id)); }
  draft(value?: unknown) {
    return this.transaction(value === undefined ? 'readonly' : 'readwrite', async tx => {
      if (value !== undefined) { tx.objectStore('meta').put(value, 'draft'); return value; }
      return request(tx.objectStore('meta').get('draft'));
    });
  }
  deleteCampaign(id: string) {
    return this.transaction('readwrite', async tx => {
      const s = await this.state(tx);
      if (s.activeId === id || s.lease?.campaignId === id) throw Error('Cancele a campanha antes de excluí-la.');
      tx.objectStore('campaigns').delete(id);
      for (const r of s.recipients.filter(r => r.campaignId === id)) tx.objectStore('recipients').delete(r.id);
      for (const e of await request(tx.objectStore('events').getAll()) as Event[]) if (e.campaignId === id) tx.objectStore('events').delete(e.id);
    });
  }
  clear() { return this.transaction('readwrite', async tx => { for (const name of ['campaigns', 'recipients', 'events', 'meta']) tx.objectStore(name).clear(); }); }
}
