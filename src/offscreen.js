// Offscreen document: hosts the AI engine and the Firestore family log.
// The service worker (ai_router.js) sends { target: 'offscreen', type, ... } messages here.
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { analyze, summarize, status, warmUp } from './engine.js';

async function logEvent(event) {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) return { ok: false, error: 'signed_out' };
    await addDoc(collection(db, 'families', user.uid, 'events'), { ...event, createdAt: serverTimestamp() });
    return { ok: true };
}

async function handle(msg) {
    switch (msg.type) {
        case 'analyze': return analyze(msg.snapshot || {}, msg.trigger || 'manual', msg.config || {});
        case 'summary': return summarize(msg.events || [], msg.config || {});
        case 'status': {
            await auth.authStateReady();
            return { ...(await status(msg.config || {})), signedIn: auth.currentUser ? auth.currentUser.email : null };
        }
        case 'logEvent': return logEvent(msg.event);
        default: return { error: `unknown type ${msg.type}` };
    }
}

warmUp(); // load Gemini Nano into memory if it's available

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.target !== 'offscreen') return false;
    handle(msg).then(sendResponse, (e) => sendResponse({ engine: 'none', error: String(e && e.message || e) }));
    return true;
});
