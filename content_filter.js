// Content filter: stop-word scanning plus the AI check (classic content script).
//  1. A stop word appears  -> the page is hidden and the AI judges the match in context.
//     block: blocked page with the reason. warn: banner. allow: page stays (keyword cleared).
//     AI off, unavailable or too slow: the keyword block applies, as in v1.3.
//  2. No stop word, but a risky page (password/card field, form posting to another site)
//     -> one background AI check; a confident scam/phishing verdict shows a warning banner.
(async function () {
    if (window.__safeSurfFilterLoaded) return;
    window.__safeSurfFilterLoaded = true;

    const AI_WAIT_MS = 12000;
    const MAX_AI_CHECKS_PER_PAGE = 4;
    const RESCAN_DEBOUNCE_MS = 800;

    // Popup "Is this page safe?" asks for a snapshot even when the filter is off.
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg && msg.command === 'getSnapshot') {
            sendResponse(SafeSurfSnapshot.build({ trigger: 'manual' }));
        }
        return false;
    });

    const settings = await chrome.storage.local.get([
        'enableContentFilter', 'stopWords', 'masterEnabled', 'parentalEnabled', 'aiMode', 'aiScanScope'
    ]);
    if (settings.masterEnabled === false || settings.parentalEnabled === false) return;

    const aiMode = settings.aiMode || 'hybrid';
    const keywordsOn = !!settings.enableContentFilter && Array.isArray(settings.stopWords) && settings.stopWords.length > 0;
    const riskyOn = aiMode !== 'off' && (settings.aiScanScope || 'riskyPages') === 'riskyPages';
    if (!keywordsOn && !riskyOn) return;

    const compiled = keywordsOn ? SafeSurfKeywords.compile(settings.stopWords) : [];

    let pageUrl = location.href;
    let cleared = new Set();   // words the AI judged harmless on this page
    let aiChecks = 0;
    let busy = false;
    let done = false;          // page blocked or warned: stop scanning
    let riskyChecked = false;

    function resetForNewUrl() {
        if (location.href === pageUrl) return;
        pageUrl = location.href;
        cleared = new Set();
        aiChecks = 0;
        done = false;
        riskyChecked = false;
    }

    function goToBlockedPage(word, vid) {
        done = true;
        const params = new URLSearchParams({ url: location.href, reason: 'content' });
        if (word) params.set('word', word);
        if (vid) params.set('vid', vid);
        window.location.href = chrome.runtime.getURL(`blocked.html?${params}`);
    }

    function askAi(snapshot, trigger) {
        const request = chrome.runtime.sendMessage({ command: 'analyzePage', snapshot, trigger }).catch(() => null);
        const timeout = new Promise((r) => setTimeout(() => r(null), AI_WAIT_MS));
        return Promise.race([request, timeout]);
    }

    // ---------- "Checking…" cover while the AI decides ----------
    let cover = null;
    function hidePage() {
        if (cover) return;
        cover = document.createElement('div');
        cover.setAttribute('aria-live', 'polite');
        cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;font:600 22px/1.4 system-ui,sans-serif;text-align:center;padding:24px;';
        cover.textContent = '🛡 Senior SafeSurf is checking this page…';
        document.documentElement.appendChild(cover);
    }
    function showPage() {
        if (cover) cover.remove();
        cover = null;
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
        const stay = document.createElement('button');
        stay.textContent = 'I understand, stay';
        stay.style.cssText = 'font:600 16px system-ui;padding:12px 20px;border-radius:12px;border:2px solid #fff;background:transparent;color:#fff;cursor:pointer;';
        stay.onclick = () => host.remove();
        row.append(back, stay);
        box.append(title, reason, engine, row);
        shadow.appendChild(box);
        document.documentElement.appendChild(host);
    }

    function applyVerdict(verdict, word) {
        if (!verdict || !verdict.verdict) return goToBlockedPage(word); // fail safe for keyword hits
        if (verdict.verdict === 'block') return goToBlockedPage(word, verdict.vid);
        showPage();
        if (verdict.verdict === 'warn') showWarning(verdict);
        else if (word) cleared.add(word);
    }

    // ---------- Stage 1: stop words ----------
    async function checkKeywords() {
        if (!keywordsOn || done || busy) return;
        const text = document.body.innerText;
        const match = SafeSurfKeywords.findMatch(text, compiled, cleared);
        if (!match) return;

        if (aiChecks >= MAX_AI_CHECKS_PER_PAGE) return goToBlockedPage(match.word);

        busy = true;
        aiChecks++;
        if (aiMode !== 'off') hidePage(); // AI off: the router answers at once with the keyword block (and logs it)
        const snapshot = SafeSurfSnapshot.build({ text, match, trigger: 'keyword' });
        const verdict = await askAi(snapshot, 'keyword');
        busy = false;
        applyVerdict(verdict, match.word);
        if (!done) scheduleScan(); // other stop words may still be on the page
    }

    // ---------- Stage 2: risky pages (scam / phishing) ----------
    async function checkRisky() {
        if (!riskyOn || done || riskyChecked) return;
        const snapshot = SafeSurfSnapshot.build({ trigger: 'risky' });
        const f = snapshot.flags;
        if (!f.passwordField && !f.cardField && f.formPostsElsewhere.length === 0) return;
        riskyChecked = true;
        const verdict = await askAi(snapshot, 'risky');
        if (!done && verdict && verdict.verdict === 'warn') showWarning(verdict);
    }

    let timer = null;
    function scheduleScan() {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            resetForNewUrl(); // single-page apps change URL without reloading
            await checkKeywords();
            await checkRisky();
        }, RESCAN_DEBOUNCE_MS);
    }

    const start = () => {
        if (!document.body) return setTimeout(start, 50);
        checkKeywords().then(() => setTimeout(checkRisky, 1500));
        new MutationObserver(() => { if (!done || location.href !== pageUrl) scheduleScan(); })
            .observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    start();
})();
