/* ==========================================================================
   Marginalia · Firebase runtime config
   --------------------------------------------------------------------------
   Values come from import.meta.env (Vite). Set them in .env.development or
   .env.production — see .env.example for the required keys.
   ========================================================================== */

import { ENV } from '../core/env.ts';

export const MARGINALIA_FIREBASE = window.MARGINALIA_FIREBASE = {
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
};
