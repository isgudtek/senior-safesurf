// Content filter: stop-word scanning plus the AI check (classic content script).
//  1. A stop word appears -> the page is blocked AT ONCE, as in v1.3 (no waiting for any AI).
//     In an AI mode the service worker then reviews the snapshot; the block page shows the AI's
//     reason, or reopens the page if the AI is confident the mention is harmless. Confident
//     verdicts are remembered per page and word, so repeat visits are instant.
//  2. No stop word, but a risky page (password/card field, form posting to another site)
//     -> one background AI check; a confident scam/phishing verdict shows a warning banner.
(async function () {
    if (window.__safeSurfFilterLoaded) return;
    window.__safeSurfFilterLoaded = true;

    const AI_WAIT_MS = 12000;            // risky-page check only (never delays a block)
    const MAX_REVIEWS_PER_PAGE = 4;      // after this many cleared words, keyword blocks without review
    const SCAN_INTERVAL_MS = 250;        // scans while the page keeps changing: at most every 250 ms
    const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

    // Popup "Is this page safe?" asks for a snapshot even when the filter is off.
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg && msg.command === 'getSnapshot') {
            sendResponse(SafeSurfSnapshot.build({ trigger: 'manual' }));
        }
        return false;
    });

    const settings = await chrome.storage.local.get([
        'enableContentFilter', 'stopWords', 'masterEnabled', 'parentalEnabled', 'aiMode', 'aiScanScope', 'verdictCache'
    ]);
    if (settings.masterEnabled === false || settings.parentalEnabled === false) return;

    const aiMode = settings.aiMode || 'hybrid';
    let keywordsOn = !!settings.enableContentFilter && Array.isArray(settings.stopWords) && settings.stopWords.length > 0;
    const riskyOn = aiMode !== 'off' && (settings.aiScanScope || 'riskyPages') === 'riskyPages';

    let compiled = keywordsOn ? SafeSurfKeywords.compile(settings.stopWords) : [];
    const verdictCache = settings.verdictCache || {};

    // New or changed Stop Words apply to pages that are already open, not only to the next page load.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !(changes.stopWords || changes.enableContentFilter)) return;
        chrome.storage.local.get(['enableContentFilter', 'stopWords']).then((s) => {
            keywordsOn = !!s.enableContentFilter && Array.isArray(s.stopWords) && s.stopWords.length > 0;
            compiled = keywordsOn ? SafeSurfKeywords.compile(s.stopWords) : [];
            if (keywordsOn) { done = false; checkKeywords(); }
        });
    });

    const pageKey = () => location.hostname.replace(/^www\./, '') + location.pathname;
    let pageUrl = location.href;
    let cleared = new Set();   // words judged harmless on this page
    let done = false;          // page blocked or warned: stop scanning
    let riskyChecked = false;

    // Words the AI already judged harmless on this page (remembered for 7 days).
    function loadClearedFromCache() {
        cleared = new Set();
        if (aiMode === 'off') return; // Keyword match mode is pure word matching, like v1.3: no AI memory
        const prefix = pageKey() + '|';
        for (const [k, v] of Object.entries(verdictCache)) {
            if (k.startsWith(prefix) && v && v.verdict === 'allow' && Date.now() - v.ts < CACHE_TTL_MS) {
                cleared.add(k.slice(prefix.length));
            }
        }
    }
    loadClearedFromCache();

    function resetForNewUrl() {
        if (location.href === pageUrl) return;
        pageUrl = location.href;
        loadClearedFromCache();
        done = false;
        riskyChecked = false;
    }

    // ---------- Stage 1: stop words, blocked instantly ----------
    function blockNow(match, text) {
        done = true;
        const params = new URLSearchParams({ url: location.href, reason: 'content', word: match.word });
        const review = aiMode !== 'off' && cleared.size < MAX_REVIEWS_PER_PAGE;
        const pid = crypto.randomUUID();
        params.set('pid', pid);
        // Hand the snapshot to the service worker without waiting: it logs the block and, in an AI mode,
        // starts the review that the block page shows. Navigation does not wait for the answer.
        const snapshot = SafeSurfSnapshot.build({ text, match, trigger: 'keyword' });
        try {
            chrome.runtime.sendMessage({ command: 'keywordHit', pid, snapshot, word: match.word, review }).catch(() => { });
        } catch { /* extension reloaded: block anyway */ }
        window.location.replace(chrome.runtime.getURL(`blocked.html?${params}`));
    }

    function checkKeywords() {
        if (!keywordsOn || done || !document.body) return;
        const text = document.body.innerText;
        const match = SafeSurfKeywords.findMatch(text, compiled, cleared);
        if (match) blockNow(match, text);
    }

    // ---------- Stage 2: risky pages (scam / phishing) ----------
    function askAi(snapshot, trigger) {
        const request = chrome.runtime.sendMessage({ command: 'analyzePage', snapshot, trigger }).catch(() => null);
        const timeout = new Promise((r) => setTimeout(() => r(null), AI_WAIT_MS));
        return Promise.race([request, timeout]);
    }

    async function checkRisky() {
        if (!riskyOn || done || riskyChecked || !document.body) return;
        const snapshot = SafeSurfSnapshot.build({ trigger: 'risky' });
        const f = snapshot.flags;
        if (!f.passwordField && !f.cardField && f.formPostsElsewhere.length === 0) return;
        riskyChecked = true;
        const verdict = await askAi(snapshot, 'risky');
        if (!done && verdict && verdict.verdict === 'warn') showWarning(verdict);
    }

    // ---------- Warning banner (shadow DOM so page CSS can't hide it) ----------
    function showWarning(verdict) {
        done = true;
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483646;';
        const shadow = host.attachShadow({ mode: 'closed' });
        const box = document.createElement('div');
        box.style.cssText = 'margin:12px;padding:20px 24px;border-radius:16px;background:#7c2d12;color:#fff;font:18px/1.5 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5);';
        const title = document.createElement('div');
        title.style.cssText = 'font-size:24px;font-weight:800;margin-bottom:6px;';
        title.textContent = '⚠️ Be careful on this page';
        const reason = document.createElement('div');
        reason.textContent = verdict.reason || 'This page looks like it could be a scam.';
        const engine = document.createElement('div');
        engine.style.cssText = 'font-size:14px;opacity:.85;margin-top:6px;';
        engine.textContent = verdict.engine === 'cloud' ? 'Checked in the cloud (Gemini)' : 'Checked on this computer (Gemini Nano)';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:12px;margin-top:14px;flex-wrap:wrap;';
        const back = document.createElement('button');
        back.textContent = 'Take me back';
        back.style.cssText = 'font:700 18px system-ui;padding:12px 20px;border-radius:12px;border:0;background:#fff;color:#7c2d12;cursor:pointer;';
        back.onclick = () => (history.length > 1 ? history.back() : (location.href = 'about:blank'));
        const block = document.createElement('button');
        block.textContent = '⛔ Block this site';
        block.style.cssText = 'font:700 18px system-ui;padding:12px 20px;border-radius:12px;border:0;background:#ef4444;color:#fff;cursor:pointer;';
        block.onclick = async () => {
            block.disabled = true;
            block.textContent = 'Blocking…';
            const res = await chrome.runtime.sendMessage({ command: 'blockSite' }).catch(() => null);
            if (!res || res.status !== 'success') { block.disabled = false; block.textContent = '⛔ Block this site'; }
        };
        const stay = document.createElement('button');
        stay.textContent = 'I understand, stay';
        stay.style.cssText = 'font:600 16px system-ui;padding:12px 20px;border-radius:12px;border:2px solid #fff;background:transparent;color:#fff;cursor:pointer;';
        stay.onclick = () => host.remove();
        row.append(back, block, stay);
        box.append(title, reason, engine, row);
        shadow.appendChild(box);
        document.documentElement.appendChild(host);
    }

    // ---------- Scheduling ----------
    // v2.0 restarted a timer on every DOM change, so pages that never stop changing were never
    // rescanned. Now: scan right away, then at most every SCAN_INTERVAL_MS while changes keep coming.
    let timer = null;
    function scheduleScan() {
        if (timer) return;
        timer = setTimeout(() => {
            timer = null;
            resetForNewUrl(); // single-page apps change URL without reloading
            checkKeywords();
            checkRisky();
        }, SCAN_INTERVAL_MS);
    }

    let observing = false;
    function start() {
        if (!document.body) return setTimeout(start, 20);
        checkKeywords();
        if (!observing) {
            observing = true;
            new MutationObserver(() => { if (!done || location.href !== pageUrl) scheduleScan(); })
                .observe(document.body, { childList: true, subtree: true, characterData: true });
        }
        setTimeout(checkRisky, 1500);
    }
    start();
    document.addEventListener('DOMContentLoaded', checkKeywords);
    window.addEventListener('load', checkKeywords);
})();
