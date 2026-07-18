/* ==========================================================================
   Marginalia · Firebase runtime config (modular SDK)
   --------------------------------------------------------------------------
   Values come from import.meta.env (Vite). Set them in .env.development or
   .env.production — see .env.example for the required keys.

   Exports the singleton app/auth/db/storage/functions instances used across
   the codebase. This replaces the compat CDN <script> tags + window.firebase.
   ========================================================================== */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, type Functions } from 'firebase/functions';
import { ENV } from '../core/env.ts';

export const MARGINALIA_FIREBASE = {
  enabled: true,
  workspaceId: ENV.WORKSPACE_ID || 'marginalia-main',
  config: {
    apiKey:            ENV.FIREBASE_API_KEY,
    authDomain:        ENV.FIREBASE_AUTH_DOMAIN,
    projectId:         ENV.FIREBASE_PROJECT_ID,
    storageBucket:     ENV.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID,
    appId:             ENV.FIREBASE_APP_ID,
  },
} as const;

function isConfigComplete(): boolean {
  return Boolean(MARGINALIA_FIREBASE.config.apiKey && MARGINALIA_FIREBASE.config.projectId);
}

export const firebaseApp: FirebaseApp | null = isConfigComplete()
  ? (getApps().length ? getApp() : initializeApp(MARGINALIA_FIREBASE.config))
  : null;

export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;
export const firestoreDb: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;
export const firebaseStorage: FirebaseStorage | null = firebaseApp ? getStorage(firebaseApp) : null;
export const firebaseFunctions: Functions | null = firebaseApp ? getFunctions(firebaseApp) : null;
