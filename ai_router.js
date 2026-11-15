// AI router for the service worker (loaded with importScripts from background.js).
// Content scripts and pages talk to this; it applies the user's switches and asks the
// AI engine (offscreen.html, Firebase AI Logic) for a verdict.

const AI_DEFAULTS = {
    aiMode: 'hybrid',          // 'off' | 'local' | 'hybrid' | 'cloud'
    aiCloudConsent: false,     // cloud is never called until the user agrees
    aiSensitivity: 'normal',   // 'low' | 'normal' | 'strict'
    aiScanScope: 'riskyPages', // 'matchOnly' | 'riskyPages'
    aiUseRemoteConfig: false,  // optional: tune prompts/thresholds from Firebase Remote Config
    familySyncEnabled: false   // optional: copy block events to Firestore for a caregiver
};

const BLOCK_LOG_MAX = 200;
const ENGINE_TIMEOUT_MS = 50000; // on-device (20s) + cloud fallback (20s) + margin

// Confidence the AI needs before it may lift a keyword block ("this mention is harmless").
const ALLOW_OVERRIDE = { low: 0.6, normal: 0.75, strict: 0.9 };
// Confidence the AI needs before it may flag a page that had no keyword hit.
const FLAG_RISKY = { low: 0.9, normal: 0.75, strict: 0.6 };

async function applyAiDefaults() {
    const current = await chrome.storage.local.get(Object.keys(AI_DEFAULTS));
    const missing = {};
    for (const [k, v] of Object.entries(AI_DEFAULTS)) {
        if (current[k] === undefined) missing[k] = v;
    }
    if (Object.keys(missing).length) await chrome.storage.local.set(missing);
}

async function getAiSettings() {
    const s = await chrome.storage.local.get([
        ...Object.keys(AI_DEFAULTS), 'masterEnabled', 'parentalEnabled'
    ]);
    return { ...AI_DEFAULTS, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) };
}

// ---------- Offscreen engine ----------

let creatingOffscreen = null;

async function ensureOffscreen() {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length) return;
    if (!creatingOffscreen) {
        creatingOffscreen = chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['DOM_PARSER', 'IFRAME_SCRIPTING'],
            justification: 'Runs the on-device Prompt API and the Firebase AI Logic SDK to classify page snapshots, and embeds the hosted cloud bridge.'
        }).finally(() => { creatingOffscreen = null; });
    }
    await creatingOffscreen;
}

async function closeOffscreen() {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length) await chrome.offscreen.closeDocument();
}

async function callEngine(type, payload = {}) {
    await ensureOffscreen();
    const request = chrome.runtime.sendMessage({ target: 'offscreen', type, ...payload });
    const timeout = new Promise((resolve) =>
        setTimeout(() => resolve({ engine: 'none', error: 'timeout' }), ENGINE_TIMEOUT_MS));
    try {
        return (await Promise.race([request, timeout])) || { engine: 'none', error: 'no_response' };
    } catch (e) {
        return { engine: 'none', error: String(e && e.message || e) };
    }
}

function engineConfig(settings) {
    return {
        mode: settings.aiMode,
        cloudConsent: settings.aiCloudConsent === true,
        useRemoteConfig: settings.aiUseRemoteConfig === true
    };
}

// ---------- Policy: turn an AI answer into what the page does ----------

function keywordVerdict(snapshot) {
    return {
        verdict: 'block',
        category: 'keyword',
        confidence: 1,
        reason: snapshot.word ? `The page contains the blocked word "${snapshot.word}".` : 'The page matched your block list.',
        engine: 'keywords'
    };
}

function applyPolicy(trigger, ai, snapshot, settings) {
    const usable = ai && (ai.engine === 'on-device' || ai.engine === 'cloud') && ai.verdict;
    if (trigger === 'keyword') {
        if (!usable) return { ...keywordVerdict(snapshot), aiError: ai && ai.error, aiStatus: ai && ai.status };
        if (ai.verdict === 'allow') {
            const needed = ALLOW_OVERRIDE[settings.aiSensitivity] ?? ALLOW_OVERRIDE.normal;
            if ((ai.confidence ?? 0) >= needed) return ai;
            // Not sure enough to lift the block: keep the keyword block, but show the AI's view.
            return { ...ai, verdict: 'block', reason: `${keywordVerdict(snapshot).reason} ${ai.reason || ''}`.trim() };
        }
        return ai; // 'warn' or 'block'
    }
    if (trigger === 'risky') {
        if (!usable || ai.verdict === 'allow') return { verdict: 'allow', engine: usable ? ai.engine : 'none' };
        const needed = FLAG_RISKY[settings.aiSensitivity] ?? FLAG_RISKY.normal;
        if ((ai.confidence ?? 0) < needed) return { ...ai, verdict: 'allow' };
        // A page with no blocked word is only ever warned about, never hard-blocked.
        return { ...ai, verdict: 'warn' };
    }
    return usable ? ai : {
        verdict: 'unknown', engine: 'none', reason: aiUnavailableReason(ai, settings),
        aiStatus: ai && ai.status, aiError: ai && ai.error
    };
}

function aiUnavailableReason(ai, settings) {
    if (settings.aiMode === 'off') return 'AI checks are turned off in settings.';
    const status = ai && ai.status;
    if (status === 'downloadable' || status === 'downloading') {
        return settings.aiCloudConsent
            ? 'The on-device AI is still downloading and the cloud check is not available.'
            : 'The on-device AI is still downloading. Allow cloud checks in settings to use the cloud meanwhile.';
    }
    if (status === 'unavailable' || status === 'missing') {
        return settings.aiCloudConsent
            ? 'This computer cannot run on-device AI and the cloud check is not available.'
            : 'This computer cannot run on-device AI. Allow cloud checks in settings to use the cloud instead.';
    }
    return 'The AI check could not run. Keyword protection is still active.';
}

// ---------- Block log (local, capped, no page text) ----------

async function recordEvent(verdict, snapshot, settings) {
    if (verdict.verdict !== 'block' && verdict.verdict !== 'warn') return;
    const event = {
        ts: Date.now(),
        host: snapshot.host || '',
        verdict: verdict.verdict,
        category: verdict.category || 'other',
        engine: verdict.engine || 'keywords',
        reason: (verdict.reason || '').slice(0, 200)
    };
    const { blockLog = [] } = await chrome.storage.local.get('blockLog');
    blockLog.unshift(event);
    await chrome.storage.local.set({ blockLog: blockLog.slice(0, BLOCK_LOG_MAX) });
    if (settings.familySyncEnabled) callEngine('logEvent', { event }).catch(() => { });
}

// ---------- Message handling ----------

async function analyze(snapshot, trigger) {
    const settings = await getAiSettings();
    if (settings.masterEnabled === false || settings.parentalEnabled === false) {
        return { verdict: 'allow', engine: 'none' };
    }
    if (trigger === 'risky' && settings.aiScanScope !== 'riskyPages') return { verdict: 'allow', engine: 'none' };

    let ai = null;
    if (settings.aiMode !== 'off') ai = await callEngine('analyze', { snapshot, trigger, config: engineConfig(settings) });

    const verdict = applyPolicy(trigger, ai, snapshot, settings);
    verdict.trigger = trigger;
    await recordEvent(verdict, snapshot, settings);

    // Keep the verdict for the blocked page (session storage; gone when Chrome closes).
    const vid = crypto.randomUUID();
    await chrome.storage.session.set({ [`verdict_${vid}`]: { ...verdict, host: snapshot.host } });
    return { ...verdict, vid };
}

async function snapshotActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !/^https?:/.test(tab.url || '')) return { error: 'restricted' };
    try {
        const snap = await chrome.tabs.sendMessage(tab.id, { command: 'getSnapshot' });
        if (snap) return { snapshot: snap };
    } catch (e) { /* content script not injected yet (tab opened before install) */ }
    try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['js/keywords.js', 'js/snapshot.js', 'content_filter.js'] });
        const snap = await chrome.tabs.sendMessage(tab.id, { command: 'getSnapshot' });
        return snap ? { snapshot: snap } : { error: 'no_snapshot' };
    } catch (e) {
        return { error: 'restricted' };
    }
}

function handleAiMessage(message, sender, sendResponse) {
    const run = (p) => { p.then(sendResponse, (e) => sendResponse({ error: String(e && e.message || e) })); return true; };

    switch (message.command) {
        case 'analyzePage':
            return run(analyze(message.snapshot || {}, message.trigger || 'keyword'));
        case 'checkActiveTab':
            return run((async () => {
                const { snapshot, error } = await snapshotActiveTab();
                if (error) return { verdict: 'unknown', engine: 'none', error };
                return analyze({ ...snapshot, trigger: 'manual' }, 'manual');
            })());
        case 'getVerdict':
            return run(chrome.storage.session.get(`verdict_${message.vid}`).then((r) => r[`verdict_${message.vid}`] || null));
        case 'aiStatus':
            return run((async () => {
                const settings = await getAiSettings();
                const status = await callEngine('status', { config: engineConfig(settings) });
                return { ...status, settings };
            })());
        case 'aiTest':
            return run((async () => {
                const settings = await getAiSettings();
                const snapshot = { title: 'Test text', host: 'test.local', excerpt: String(message.text || '').slice(0, 3000) };
                const ai = await callEngine('analyze', { snapshot, trigger: 'manual', config: engineConfig(settings) });
                return applyPolicy('manual', ai, snapshot, settings);
            })());
        case 'aiSummary':
            return run((async () => {
                const settings = await getAiSettings();
                return callEngine('summary', { events: message.events || [], config: engineConfig(settings) });
            })());
        case 'pexelsSearch': // backgrounds; the key stays in the engine (Remote Config)
            return run(callEngine('pexels', { query: message.query, page: message.page, perPage: message.perPage }));
        case 'resetEngine':
            return run(closeOffscreen().then(() => ({ ok: true })));
        default:
            return false;
    }
}
