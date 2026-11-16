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

// ---------- Instant keyword blocks + background AI review ----------
// The page is already on the block page when this runs. The AI's verdict is kept for the block page
// (awaitVerdict) and, when confident, remembered per page and word for 7 days (verdictCache), so the
// next visit is decided instantly: a harmless mention opens directly, a confirmed block shows its reason.

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const pendingReviews = new Map(); // pid -> Promise<verdict>

const cacheKey = (url, word) => {
    try {
        const u = new URL(url);
        return `${u.hostname.replace(/^www\./, '')}${u.pathname}|${word}`;
    } catch { return null; }
};

async function readCache(key) {
    if (!key) return null;
    const { verdictCache = {} } = await chrome.storage.local.get('verdictCache');
    const v = verdictCache[key];
    return v && Date.now() - v.ts < CACHE_TTL_MS ? v : null;
}

async function writeCache(key, verdict) {
    if (!key) return;
    const { verdictCache = {} } = await chrome.storage.local.get('verdictCache');
    verdictCache[key] = {
        ts: Date.now(), verdict: verdict.verdict, category: verdict.category,
        reason: (verdict.reason || '').slice(0, 220), engine: verdict.engine
    };
    const keys = Object.keys(verdictCache);
    if (keys.length > CACHE_MAX) {
        keys.sort((a, b) => verdictCache[a].ts - verdictCache[b].ts)
            .slice(0, keys.length - CACHE_MAX).forEach((k) => delete verdictCache[k]);
    }
    await chrome.storage.local.set({ verdictCache });
}

async function reviewKeywordHit({ pid, snapshot, word, words, review }, tabUrl) {
    const key = cacheKey(tabUrl, word);
    let verdict;
    const cached = review ? await readCache(key) : null;
    if (cached && cached.verdict !== 'allow') {
        // Same page and word were already reviewed: show that verdict at once, no AI call.
        verdict = { ...cached, cached: true, trigger: 'keyword' };
        await recordEvent(verdict, snapshot, await getAiSettings());
    } else if (!review) {
        // Keyword match mode (or too many reviews on this page): log the plain keyword block.
        const settings = await getAiSettings();
        verdict = { ...keywordVerdict(snapshot), trigger: 'keyword' };
        await recordEvent(verdict, snapshot, settings);
    } else {
        verdict = await analyze(snapshot, 'keyword');
        // Only AI answers are remembered; applyPolicy already turned unsure "allow"s into blocks.
        // The one review covers every blocked word found on the page, so remember it for each of them.
        if (verdict.engine === 'on-device' || verdict.engine === 'cloud') {
            const all = [...new Set([word, ...(Array.isArray(words) ? words.slice(0, 40) : [])])];
            for (const w of all) await writeCache(cacheKey(tabUrl, w), verdict);
            // A harmless verdict trusts the whole page, so text that loads later doesn't block it again.
            if (verdict.verdict === 'allow') await writeCache(cacheKey(tabUrl, '*'), verdict);
        }
    }
    const result = { ...verdict, word, url: tabUrl };
    await chrome.storage.session.set({ [`pending_${pid}`]: result });
    return result;
}

async function awaitReview(pid) {
    if (pendingReviews.has(pid)) return pendingReviews.get(pid);
    // The service worker may have restarted, or the block page asked first: poll briefly.
    for (let i = 0; i < 56; i++) {
        const r = await chrome.storage.session.get(`pending_${pid}`);
        if (r[`pending_${pid}`]) return r[`pending_${pid}`];
        if (pendingReviews.has(pid)) return pendingReviews.get(pid);
        await new Promise((res) => setTimeout(res, 500));
    }
    return null;
}

// Load Gemini Nano and the cloud bridge early, so the first review isn't paying the start-up cost.
async function prewarmEngine() {
    const settings = await getAiSettings();
    if (settings.aiMode === 'off') return;
    callEngine('prewarm', { config: engineConfig(settings) }).catch(() => { });
}

// ---------- Message handling ----------

async function analyze(snapshot, trigger) {
    const settings = await getAiSettings();
    // Automatic checks follow the protection switches; a check the user asked for always runs.
    if (trigger !== 'manual' && (settings.masterEnabled === false || settings.parentalEnabled === false)) {
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
        case 'keywordHit': {
            // From the content script, which is already navigating to the block page. Use the tab's
            // real URL (not anything the page says) for the cache key.
            const tabUrl = (sender.tab && sender.tab.url) || '';
            const p = reviewKeywordHit(message, tabUrl).catch((e) => ({ verdict: 'block', engine: 'keywords', error: String(e && e.message || e) }));
            pendingReviews.set(message.pid, p);
            p.finally(() => setTimeout(() => pendingReviews.delete(message.pid), 60000));
            sendResponse({ ok: true });
            return false;
        }
        case 'awaitVerdict':
            return run(awaitReview(message.pid));
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
