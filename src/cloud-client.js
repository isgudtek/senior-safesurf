// Extension side of the hosted cloud bridge: a hidden iframe in the offscreen document.
import { BRIDGE_ORIGIN, BRIDGE_URL } from './firebase-config.js';

const READY_TIMEOUT_MS = 15000;
const pending = new Map();
let frame = null;
let ready = null;

window.addEventListener('message', (event) => {
    if (event.origin !== BRIDGE_ORIGIN) return;
    const msg = event.data || {};
    if (msg.source !== 'safesurf-cloud' || !msg.id) return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.text);
    else p.reject(new Error(msg.error || 'cloud bridge error'));
});

function ensureFrame() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { ready = null; frame?.remove(); frame = null; reject(new Error('cloud bridge did not load')); }, READY_TIMEOUT_MS);
        const onReady = (event) => {
            if (event.origin !== BRIDGE_ORIGIN || !event.data || !event.data.ready) return;
            window.removeEventListener('message', onReady);
            clearTimeout(timer);
            resolve();
        };
        window.addEventListener('message', onReady);
        frame = document.createElement('iframe');
        frame.src = BRIDGE_URL;
        frame.style.display = 'none';
        document.body.appendChild(frame);
    });
    return ready;
}

/** Runs a cloud Gemini request through the hosted page. kind: 'verdict' (JSON schema) or 'text'. */
export async function cloudGenerate(kind, prompt, model) {
    try {
        return await sendToBridge(kind, prompt, model);
    } catch (e) {
        // A rejected App Check attempt throttles the bridge page for its lifetime; reload it and retry once.
        if (!/app ?check|attestation|throttle|401|403/i.test(String(e && e.message))) throw e;
        resetFrame();
        return sendToBridge(kind, prompt, model);
    }
}

function resetFrame() {
    if (frame) frame.remove();
    frame = null;
    ready = null;
}

async function sendToBridge(kind, prompt, model) {
    await ensureFrame();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        frame.contentWindow.postMessage({ source: 'safesurf', id, kind, prompt, model }, BRIDGE_ORIGIN);
    });
}

export async function bridgeReady() {
    try { await ensureFrame(); return true; } catch { return false; }
}
