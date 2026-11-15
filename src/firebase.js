// Firebase setup shared by the extension's module pages (offscreen engine, options "Family" panel).
import { initializeApp, getApps } from 'firebase/app';
import { initializeAppCheck, CustomProvider } from 'firebase/app-check';
// The web-extension build of Auth never loads remote scripts (MV3 forbids them).
import { getAuth } from 'firebase/auth/web-extension';
import { getFirestore } from 'firebase/firestore';

import { firebaseConfig } from './firebase-config.js';

// Only for developer builds with CLOUD_VIA=direct in .env.local (never committed).
const DEBUG_TOKEN = __APPCHECK_DEBUG_TOKEN__;

export const app = getApps()[0] || initializeApp(firebaseConfig);

// Firebase AI Logic requires App Check, and reCAPTCHA can't run on a chrome-extension:// origin.
// Cloud calls therefore go through the hosted bridge (src/cloud-bridge.js on senior-safesurf.web.app),
// which has real reCAPTCHA Enterprise attestation. On-device calls don't need App Check.
export const cloudDirect = !!DEBUG_TOKEN;
export const cloudConfigured = true;
if (DEBUG_TOKEN) self.FIREBASE_APPCHECK_DEBUG_TOKEN = DEBUG_TOKEN;
initializeAppCheck(app, {
    provider: new CustomProvider({
        getToken: () => Promise.reject(new Error('No App Check debug token configured for this build.'))
    }),
    isTokenAutoRefreshEnabled: true
});

export const auth = getAuth(app);
export const db = getFirestore(app);
