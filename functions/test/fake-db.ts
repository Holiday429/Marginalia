/* Minimal in-memory Firestore stand-in for the gateway/quota unit tests.
   Implements only what ai-quota.ts and ai-context.ts use. */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export class FakeDb {
  store = new Map<string, Json>();

  seed(path: string, data: Json) { this.store.set(path, data); return this; }
  read(path: string): Json | undefined { return this.store.get(path); }

  doc(path: string) {
    const snap = () => {
      const data = this.store.get(path);
      return { exists: data !== undefined, data: () => (data ? structuredClone(data) : undefined) };
    };
    return { path, get: async () => snap(), __snap: snap };
  }

  collection(path: string) {
    const filters: Array<[string, unknown]> = [];
    let max = Infinity;
    const q = {
      where: (field: string, _op: '==', value: unknown) => { filters.push([field, value]); return q; },
      limit: (n: number) => { max = n; return q; },
      get: async () => {
        const docs = [...this.store.entries()]
          .filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
          .filter(([, d]) => filters.every(([f, v]) => d[f] === v))
          .slice(0, max)
          .map(([p, d]) => ({ id: p.split('/').pop()!, data: () => structuredClone(d) }));
        return { docs };
      },
    };
    return q;
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const tx = {
      get: async (ref: { path: string }) => this.doc(ref.path).__snap(),
      set: (ref: { path: string }, data: Json, opts?: { merge: boolean }) => {
        this.store.set(ref.path, opts?.merge ? { ...(this.store.get(ref.path) ?? {}), ...data } : data);
      },
    };
    return fn(tx);
  }
}
