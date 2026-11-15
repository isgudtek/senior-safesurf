// Popup: "Is this page safe?" button and the quick AI mode switch.
(function () {
    const btn = document.getElementById('aiCheckBtn');
    const out = document.getElementById('aiCheckResult');
    const modeSelect = document.getElementById('aiModeSelect');
    if (!btn || !out || !modeSelect) return;

    const t = (key, fallback, args) => {
        const v = typeof i18nCustom !== 'undefined' ? i18nCustom.t(key, args) : key;
        return v && v !== key ? v : fallback;
    };

    const ENGINE_LABEL = {
        'on-device': () => t('engine_device', 'Checked on this computer (Gemini Nano). Nothing was sent online.'),
        cloud: () => t('engine_cloud', 'Checked in the cloud (Gemini via Firebase).'),
        keywords: () => t('engine_keywords', 'Checked with your keyword list.'),
        none: () => ''
    };
    const HEADLINE = {
        allow: () => t('verdict_allow', '✅ This page looks safe'),
        warn: () => t('verdict_warn', '⚠️ Be careful on this page'),
        block: () => t('verdict_block', '⛔ This page is not safe'),
        unknown: () => t('verdict_unknown', 'ℹ️ Could not check this page')
    };

    function render(v) {
        out.className = `ai-check-result ${v.verdict || 'unknown'}`;
        out.textContent = '';
        const head = document.createElement('div');
        head.className = 'verdict';
        head.textContent = (HEADLINE[v.verdict] || HEADLINE.unknown)();
        const reason = document.createElement('div');
        reason.textContent = v.error === 'restricted'
            ? t('ai_restricted', 'Chrome does not allow checking this kind of page.')
            : (v.reason || '');
        const engine = document.createElement('div');
        engine.className = 'engine';
        engine.textContent = (ENGINE_LABEL[v.engine] || ENGINE_LABEL.none)() + (v.escalated ? ` ${t('engine_escalated', '(double-checked in the cloud)')}` : '');
        out.append(head, reason, engine);
        out.classList.remove('hidden');
    }

    // First use: the popup click is a user gesture, so it may start the on-device model download.
    async function maybeStartNanoDownload() {
        if (typeof LanguageModel === 'undefined') return;
        try {
            const opts = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
            const state = await LanguageModel.availability(opts);
            if (state === 'downloadable') LanguageModel.create(opts).then((s) => s.destroy()).catch(() => { });
        } catch { /* not supported here */ }
    }

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = t('ai_checking', 'Checking…');
        out.classList.add('hidden');
        const { aiMode } = await chrome.storage.local.get('aiMode');
        if (aiMode !== 'off' && aiMode !== 'cloud') maybeStartNanoDownload();
        try {
            render(await chrome.runtime.sendMessage({ command: 'checkActiveTab' }) || { verdict: 'unknown' });
        } catch (e) {
            render({ verdict: 'unknown', reason: String(e.message || e) });
        } finally {
            btn.disabled = false;
            btn.textContent = label;
        }
    });

    chrome.storage.local.get(['aiMode', 'aiCloudConsent']).then(({ aiMode }) => {
        modeSelect.value = aiMode || 'hybrid';
    });

    modeSelect.addEventListener('change', async () => {
        const mode = modeSelect.value;
        const { aiCloudConsent } = await chrome.storage.local.get('aiCloudConsent');
        if ((mode === 'cloud' || mode === 'hybrid') && !aiCloudConsent) {
            const ok = confirm(t('ai_consent_confirm',
                'Allow cloud checks? When the on-device AI is missing or unsure, a small snapshot of the page (site name, title, headings and a short excerpt, never passwords or form contents) is sent to Gemini through Firebase.'));
            await chrome.storage.local.set({ aiMode: mode, aiCloudConsent: ok });
            return;
        }
        await chrome.storage.local.set({ aiMode: mode });
    });
})();
