// Hosted on https://senior-safesurf.web.app/cloud.html and embedded (hidden) by the extension's
// offscreen document. It makes the cloud Gemini call with Firebase AI Logic and App Check backed by
// reCAPTCHA Enterprise, which can't run on a chrome-extension:// origin. No debug token is needed.
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai';
import { firebaseConfig, RECAPTCHA_SITE_KEY, EXTENSION_IDS } from './firebase-config.js';
import { verdictSchema } from './schema.js';

const ALLOWED_ORIGINS = new Set(EXTENSION_IDS.map((id) => `chrome-extension://${id}`));
const MAX_PROMPT_CHARS = 12000;
const MODEL_RE = /^gemini-[a-z0-9.-]{1,40}$/;

const app = initializeApp(firebaseConfig);
initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
const ai = getAI(app, { backend: new GoogleAIBackend() });

function model(kind, name) {
    const generationConfig = kind === 'verdict'
        ? { responseMimeType: 'application/json', responseSchema: verdictSchema, temperature: 0 }
        : { temperature: 0.4 };
    return getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: name, generationConfig } });
}

window.addEventListener('message', async (event) => {
    if (!ALLOWED_ORIGINS.has(event.origin)) return; // only Senior SafeSurf may use this page
    const msg = event.data || {};
    if (msg.source !== 'safesurf' || !msg.id) return;
    const reply = (body) => event.source.postMessage({ source: 'safesurf-cloud', id: msg.id, ...body }, event.origin);

    const prompt = String(msg.prompt || '');
    const name = MODEL_RE.test(msg.model || '') ? msg.model : 'gemini-3.5-flash-lite';
    if (!prompt || prompt.length > MAX_PROMPT_CHARS || !['verdict', 'text'].includes(msg.kind)) {
        return reply({ ok: false, error: 'invalid request' });
    }
    try {
        const res = (await model(msg.kind, name).generateContent(prompt)).response;
        reply({ ok: true, text: res.text() });
    } catch (e) {
        reply({ ok: false, error: String((e && e.message) || e).slice(0, 300) });
    }
});

// Tell an embedding extension that the bridge is ready.
if (window.parent !== window) {
    for (const origin of ALLOWED_ORIGINS) {
        try { window.parent.postMessage({ source: 'safesurf-cloud', ready: true }, origin); } catch { /* wrong origin */ }
    }
}
