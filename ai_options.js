// Options page: "AI Protection" section (classic script, loaded after options.js).
(function () {
    const $ = (id) => document.getElementById(id);
    const t = (key, fallback, args) => {
        const v = typeof i18nCustom !== 'undefined' ? i18nCustom.t(key, args) : key;
        return v && v !== key ? v : fallback;
    };
    const guard = async () => (typeof checkSecurity === 'function' ? checkSecurity() : true);

    const NANO_OPTS = {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }]
    };

    const MODE_HELP = {
        off: () => t('ai_help_off', 'Only your keyword list is used, exactly like before. Pages with a blocked word are blocked immediately.'),
        local: () => t('ai_help_local', 'The AI runs only on this computer. Nothing leaves it. If the on-device AI is not available, your keyword list is used.'),
        hybrid: () => t('ai_help_hybrid', 'Recommended. The AI runs on this computer first. If it is missing or unsure, and you allowed cloud checks, a small snapshot is checked in the cloud.'),
        cloud: () => t('ai_help_cloud', 'Every check runs in the cloud (needs cloud checks allowed). Useful on computers that cannot run on-device AI.')
    };

    let settings = {};

    async function load() {
        settings = await chrome.storage.local.get(['aiMode', 'aiCloudConsent', 'aiSensitivity', 'aiScanScope', 'aiUseRemoteConfig']);
        settings.aiMode ??= 'hybrid';
        renderMode();
        $('aiConsentToggle').checked = settings.aiCloudConsent === true;
        $('aiSensitivity').value = settings.aiSensitivity || 'normal';
        $('aiScopeToggle').checked = (settings.aiScanScope || 'riskyPages') === 'riskyPages';
        $('aiRemoteConfigToggle').checked = settings.aiUseRemoteConfig === true;
        refreshNano();
        refreshEngineStatus();
    }

    function renderMode() {
        document.querySelectorAll('#aiModeGroup .category-btn').forEach((b) =>
            b.classList.toggle('active', b.dataset.mode === settings.aiMode));
        let help = (MODE_HELP[settings.aiMode] || MODE_HELP.hybrid)();
        if ((settings.aiMode === 'cloud' || settings.aiMode === 'hybrid') && !settings.aiCloudConsent) {
            help += ' ' + t('ai_help_need_consent', 'Cloud checks are not allowed yet, so only the on-device AI and keywords are used.');
        }
        $('aiModeHelp').textContent = help;
    }

    async function save(patch) {
        Object.assign(settings, patch);
        await chrome.storage.local.set(patch);
        renderMode();
        refreshEngineStatus();
    }

    // ---------- On-device model ----------
    async function refreshNano() {
        const name = $('nanoStatusName');
        const desc = $('nanoStatusDesc');
        const btn = $('nanoDownloadBtn');
        btn.classList.add('hidden');
        if (typeof LanguageModel === 'undefined') {
            name.textContent = t('nano_missing', 'Not available in this Chrome');
            desc.textContent = t('nano_missing_desc', 'On-device AI needs desktop Chrome 138 or newer. Update Chrome, or use cloud checks.');
            return 'missing';
        }
        let state;
        try { state = await LanguageModel.availability(NANO_OPTS); } catch { state = 'unavailable'; }
        if (state === 'available') {
            name.textContent = t('nano_ready', '✅ Ready on this computer');
            desc.textContent = t('nano_ready_desc', 'Checks run locally, work offline and cost nothing.');
        } else if (state === 'downloadable' || state === 'downloading') {
            name.textContent = state === 'downloading' ? t('nano_downloading', 'Downloading…') : t('nano_downloadable', 'Not downloaded yet');
            desc.textContent = t('nano_download_desc', 'One-time download of about 4 GB on an unmetered connection. Chrome needs 22 GB of free disk space.');
            btn.classList.remove('hidden');
        } else {
            name.textContent = t('nano_unavailable', '❌ This computer cannot run on-device AI');
            desc.textContent = t('nano_unavailable_desc', 'It needs Windows 10/11, macOS 13+, Linux or a Chromebook Plus, 22 GB of free disk space, and a GPU with more than 4 GB of memory or 16 GB of RAM. Senior SafeSurf will use cloud checks (if allowed) or your keyword list.');
        }
        return state;
    }

    async function downloadNano() {
        const bar = $('nanoProgressBar');
        $('nanoProgress').classList.remove('hidden');
        $('nanoDownloadBtn').disabled = true;
        $('nanoStatusName').textContent = t('nano_downloading', 'Downloading…');
        try {
            const session = await LanguageModel.create({
                ...NANO_OPTS,
                monitor(m) {
                    m.addEventListener('downloadprogress', (e) => { bar.style.width = `${Math.round(e.loaded * 100)}%`; });
                }
            });
            session.destroy();
            bar.style.width = '100%';
        } catch (e) {
            $('nanoStatusDesc').textContent = t('nano_download_failed', 'The download could not start: ') + (e.message || e);
        } finally {
            $('nanoDownloadBtn').disabled = false;
            setTimeout(() => $('nanoProgress').classList.add('hidden'), 1500);
            refreshNano();
            refreshEngineStatus();
        }
    }

    // ---------- Engine / cloud / Remote Config status ----------
    async function refreshEngineStatus() {
        const cloud = $('cloudStatus');
        const rcEl = $('rcStatus');
        let s;
        try { s = await chrome.runtime.sendMessage({ command: 'aiStatus' }); } catch (e) { s = { error: e.message }; }
        if (!s || s.error) {
            cloud.textContent = t('engine_status_error', 'The AI engine did not answer: ') + (s && s.error || '');
            return;
        }
        if (!s.cloudConfigured) {
            cloud.textContent = t('cloud_not_configured', '⚠️ This build has no App Check debug token, so cloud checks are rejected. See the README.');
        } else if (!settings.aiCloudConsent) {
            cloud.textContent = t('cloud_off', 'Cloud checks are off.');
        } else if (s.remoteConfig && s.remoteConfig.values && s.remoteConfig.values.ai_cloud_enabled === false) {
            cloud.textContent = t('cloud_killed', 'Cloud checks are paused by Remote Config.');
        } else if (s.cloudReady === false) {
            cloud.textContent = t('cloud_bridge_down', '⚠️ The cloud bridge (senior-safesurf.web.app) did not load. Check the internet connection.');
        } else {
            cloud.textContent = t('cloud_on', '☁️ Cloud checks allowed. Model: ') + (s.remoteConfig ? s.remoteConfig.values.ai_cloud_model : '') + (s.cloudPath ? ` · ${s.cloudPath}` : '');
        }
        if (!settings.aiUseRemoteConfig) rcEl.textContent = '';
        else if (s.remoteConfig && s.remoteConfig.active) rcEl.textContent = t('rc_active', 'Remote Config loaded: ') + JSON.stringify(s.remoteConfig.values);
        else rcEl.textContent = t('rc_defaults', 'Remote Config not reachable, using built-in defaults. ') + ((s.remoteConfig && s.remoteConfig.error) || '');
    }

    // ---------- Try it ----------
    const VERDICT = {
        allow: () => t('verdict_allow', '✅ This page looks safe'),
        warn: () => t('verdict_warn', '⚠️ Be careful on this page'),
        block: () => t('verdict_block', '⛔ This page is not safe'),
        unknown: () => t('verdict_unknown', 'ℹ️ Could not check this page')
    };
    const ENGINE = {
        'on-device': () => t('engine_device', 'Checked on this computer (Gemini Nano). Nothing was sent online.'),
        cloud: () => t('engine_cloud', 'Checked in the cloud (Gemini via Firebase).'),
        none: () => ''
    };

    async function runTest() {
        const box = $('aiTestResult');
        const btn = $('aiTestBtn');
        btn.disabled = true;
        box.classList.remove('hidden');
        box.textContent = t('ai_checking', 'Checking…');
        try {
            const v = (await chrome.runtime.sendMessage({ command: 'aiTest', text: $('aiTestInput').value })) || { verdict: 'unknown', aiError: 'no answer from the service worker' };
            box.textContent = '';
            const head = document.createElement('div');
            head.style.cssText = 'font-size:18px;font-weight:800;margin-bottom:6px;';
            head.textContent = (VERDICT[v.verdict] || VERDICT.unknown)();
            const reason = document.createElement('div');
            reason.textContent = v.reason || '';
            const meta = document.createElement('div');
            meta.style.cssText = 'font-size:12px;color:var(--text-muted);margin-top:8px;';
            const bits = [(ENGINE[v.engine] || ENGINE.none)()];
            if (v.category) bits.push(`${t('label_category', 'Type')}: ${v.category}`);
            if (typeof v.confidence === 'number') bits.push(`${t('label_confidence', 'Confidence')}: ${Math.round(v.confidence * 100)}%`);
            if (v.ms) bits.push(`${v.ms} ms`);
            if (v.escalated) bits.push(t('engine_escalated', '(double-checked in the cloud)'));
            if (v.deviceError) bits.push(`on-device failed: ${v.deviceError}`);
            if (v.aiError) bits.push(`details: ${v.aiError}`);
            if (v.aiStatus) bits.push(`Nano: ${v.aiStatus}`);
            meta.textContent = bits.filter(Boolean).join(' · ');
            box.append(head, reason, meta);
        } catch (e) {
            box.textContent = String(e.message || e);
        } finally {
            btn.disabled = false;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!$('section-ai')) return;
        document.querySelectorAll('#aiModeGroup .category-btn').forEach((b) =>
            b.addEventListener('click', async () => { if (await guard()) save({ aiMode: b.dataset.mode }); }));
        $('aiConsentToggle').addEventListener('click', async (e) => { if (!(await guard())) e.preventDefault(); });
        $('aiConsentToggle').addEventListener('change', (e) => save({ aiCloudConsent: e.target.checked }));
        $('aiSensitivity').addEventListener('change', async (e) => {
            if (await guard()) save({ aiSensitivity: e.target.value }); else e.target.value = settings.aiSensitivity || 'normal';
        });
        $('aiScopeToggle').addEventListener('click', async (e) => { if (!(await guard())) e.preventDefault(); });
        $('aiScopeToggle').addEventListener('change', (e) => save({ aiScanScope: e.target.checked ? 'riskyPages' : 'matchOnly' }));
        $('aiRemoteConfigToggle').addEventListener('change', async (e) => {
            await save({ aiUseRemoteConfig: e.target.checked });
            await chrome.runtime.sendMessage({ command: 'resetEngine' }); // reload config in the engine
            refreshEngineStatus();
        });
        $('nanoDownloadBtn').addEventListener('click', downloadNano);
        $('aiTestBtn').addEventListener('click', runTest);
        load();
    });
})();
