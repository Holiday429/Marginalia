// Marginalia · Entitlements store
// Resolves and exposes the current user's entitlements from Firestore.
//
// Usage in any view:
//   import { EntitlementsStore } from '../store/entitlements-store.ts';
//   if (EntitlementsStore.hasEntitlement('library.3d')) { ... }
//   const unsub = EntitlementsStore.subscribe(() => rerender());

import type { Entitlement, Plan } from '../data/schema/entitlements.js';
import { PLAN_ENTITLEMENTS } from '../data/schema/entitlements.js';
import { logError } from '../services/analytics.ts';

type ChangeListener = () => void;

interface EntitlementsState {
  plan: Plan;
  entitlements: Entitlement[];
  ready: boolean;
}

const state: EntitlementsState = {
  plan: 'free',
  entitlements: PLAN_ENTITLEMENTS.free,
  ready: false,
};

const listeners = new Set<ChangeListener>();

function emit() {
  listeners.forEach((fn) => fn());
  window.dispatchEvent(new CustomEvent('marginalia:entitlements-changed', {
    detail: { plan: state.plan, entitlements: state.entitlements },
  }));
}

// Unsubscribe fn for the active Firestore listener (replaced on each sign-in).
let unsubSnapshot: (() => void) | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function subscribeForUser(uid: string, db: any): void {
  const userRef = db.doc(`users/${uid}`);

  unsubSnapshot = userRef.onSnapshot(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (snap: any) => {
      const data = snap.data() as Record<string, unknown> | undefined;

      let plan: Plan = 'free';
      if (data?.plan === 'pro' || data?.plan === 'lifetime') {
        plan = data.plan as Plan;
      }

      const entitlements = PLAN_ENTITLEMENTS[plan];

      // Write plan + entitlements on first sign-in (or when the doc is missing them).
      if (!data?.plan || !data?.entitlements) {
        await userRef.set({ plan, entitlements }, { merge: true });
      }

      state.plan = plan;
      state.entitlements = entitlements;
      state.ready = true;
      emit();
    },
    (err: unknown) => {
      logError(err instanceof Error ? err : new Error('[EntitlementsStore] snapshot error'), { context: 'entitlements-store:snapshot' });
    }
  );
}

function reset() {
  if (unsubSnapshot) {
    unsubSnapshot();
    unsubSnapshot = null;
  }
  state.plan = 'free';
  state.entitlements = PLAN_ENTITLEMENTS.free;
  state.ready = false;
  emit();
}

// Wire to auth lifecycle.
window.addEventListener('marginalia:auth-changed', (event) => {
  const { user, enabled } = (event as CustomEvent).detail as {
    enabled: boolean;
    ready: boolean;
    user: { uid: string; email: string; displayName: string } | null;
  };

  if (!enabled || !user) {
    reset();
    return;
  }

  // db is available via MarginaliaAuth after auth is ready.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (window as any).MarginaliaAuth?.db;
  if (!db) return;

  // Cancel any previous listener before starting a new one.
  if (unsubSnapshot) { unsubSnapshot(); unsubSnapshot = null; }
  subscribeForUser(user.uid, db);
});

export const EntitlementsStore = {
  hasEntitlement(id: Entitlement): boolean {
    return state.entitlements.includes(id);
  },

  get plan(): Plan {
    return state.plan;
  },

  get ready(): boolean {
    return state.ready;
  },

  /** Subscribe to entitlement changes. Returns an unsubscribe function. */
  subscribe(listener: ChangeListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
