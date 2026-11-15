// Firebase setup shared by the extension's module pages (offscreen engine, options "Family" panel).
import { initializeApp, getApps } from 'firebase/app';
import { initializeAppCheck, CustomProvider } from 'firebase/app-check';
// The web-extension build of Auth never loads remote scripts (MV3 forbids them).
import { getAuth } from 'firebase/auth/web-extension';
import { getFirestore } from 'firebase/firestore';

// Same Firebase project and web app as the hackathon demo (public identifiers, not secrets).
export const firebaseConfig = {
    apiKey: 'AIzaSyDHGZPZH0H2KeJMY3Xyt92YtO5BYyqjrJM',
    authDomain: 'hackathon-e2f2b.firebaseapp.com',
    projectId: 'hackathon-e2f2b',
    storageBucket: 'hackathon-e2f2b.firebasestorage.app',
    messagingSenderId: '297260397898',
    appId: '1:297260397898:web:c674f65cf2765b9a34bdb3'
};

// Injected by build.mjs from .env.local (never committed).
const DEBUG_TOKEN = __APPCHECK_DEBUG_TOKEN__;

export const app = getApps()[0] || initializeApp(firebaseConfig);

// Firebase AI Logic requires App Check. reCAPTCHA can't run on a chrome-extension:// origin,
// so the extension uses an App Check debug token (accepted for hackathon submissions).
// Without a token, cloud calls are rejected and the extension stays on-device / keywords.
export const cloudConfigured = !!DEBUG_TOKEN;
if (DEBUG_TOKEN) self.FIREBASE_APPCHECK_DEBUG_TOKEN = DEBUG_TOKEN;
initializeAppCheck(app, {
    provider: new CustomProvider({
        getToken: () => Promise.reject(new Error('No App Check debug token configured for this build.'))
    }),
    isTokenAutoRefreshEnabled: true
});

export const auth = getAuth(app);
export const db = getFirestore(app);
