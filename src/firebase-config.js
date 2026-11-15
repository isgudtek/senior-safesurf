// Firebase project shared by the extension and the hosted cloud bridge (public identifiers, not secrets).
export const firebaseConfig = {
    apiKey: 'AIzaSyDHGZPZH0H2KeJMY3Xyt92YtO5BYyqjrJM',
    authDomain: 'hackathon-e2f2b.firebaseapp.com',
    projectId: 'hackathon-e2f2b',
    storageBucket: 'hackathon-e2f2b.firebasestorage.app',
    messagingSenderId: '297260397898',
    appId: '1:297260397898:web:c674f65cf2765b9a34bdb3'
};

// reCAPTCHA Enterprise site key used by App Check on the hosted bridge (public by design).
export const RECAPTCHA_SITE_KEY = '6Lc7Ax8uAAAAADspjyys37ZD0UONDgsIXa1UR59J';

// Hosted page that runs cloud Gemini calls with real App Check attestation.
export const BRIDGE_ORIGIN = 'https://senior-safesurf.web.app';
export const BRIDGE_URL = `${BRIDGE_ORIGIN}/cloud.html`;

// Extensions allowed to use the bridge: the Chrome Web Store build and the unpacked GitHub build
// (pinned by the "key" in manifest.json).
export const EXTENSION_IDS = ['acghgebogofndhakooiciaheodcakpjf', 'podaapoggacmjgkkghifgmigpdiakklb'];
