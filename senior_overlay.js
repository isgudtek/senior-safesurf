(function () {
    console.log("[Senior SafeSurf] Overlay script loaded.");

    // Config
    const OVERLAY_ID = 'safenet-senior-overlay';
    let currentZoom = 1;

    // Initialize logic
    init();

    function init() {
        // 1. Initial State Check (Aggressive)
        const check = () => {
            try {
                chrome.storage.local.get(['showSeniorOverlay'], (res) => {
                    handleToggle(res.showSeniorOverlay);
                });
            } catch (e) {
                console.warn('[Senior SafeSurf] Storage check failed, context may be invalidated.');
            }
        };

        check();
        // Fire again on DOMContentLoaded to ensure we didn't miss the body window
        window.addEventListener('DOMContentLoaded', check);

        // 2. Storage Changed Listener
        try {
            chrome.storage.onChanged.addListener((changes) => {
                if (changes.showSeniorOverlay) {
                    handleToggle(changes.showSeniorOverlay.newValue);
                }
                // Re-create overlay if theme changed
                if (changes.themeMode) {
                    const el = document.getElementById(OVERLAY_ID);
                    if (el) {
                        el.remove();
                        chrome.storage.local.get(['showSeniorOverlay'], (res) => {
                            if (res.showSeniorOverlay) createOverlay();
                        });
                    }
                }
            });
        } catch (e) {
            console.warn('[Senior SafeSurf] Could not add storage listener.');
        }

        // 3. Command listener
        try {
            chrome.runtime.onMessage.addListener((message) => {
                if (message.command === "toggleOverlay") {
                    handleToggle(message.enabled);
                }
            });
        } catch (e) {
            console.warn('[Senior SafeSurf] Could not add message listener.');
        }
    }

    function handleToggle(shouldShow) {
        if (shouldShow === true) {
            if (document.body) {
                showOverlay();
            } else {
                // Poll aggressively for body
                setTimeout(() => handleToggle(true), 100);
            }
        } else {
            hideOverlay();
        }
    }

    let creating = false; // the toolbar is built in an async callback; don't build it twice

    function createOverlay() {
        if (!document.body) return;
        if (creating || document.getElementById(OVERLAY_ID)) return;
        creating = true;

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;

        // Get theme to apply appropriate styling
        chrome.storage.local.get(['themeMode'], (res) => {
            let effectiveTheme = res.themeMode || 'dark';
            if (effectiveTheme === 'auto') {
                effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }

            const isLight = effectiveTheme === 'light';
            const bgColor = isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(15, 23, 42, 0.9)';
            const textColor = isLight ? '#0f172a' : 'white';
            const borderColor = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
            const btnBg = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.1)';
            const btnHoverBg = isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.2)';
            const mutedColor = isLight ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)';
            const separatorColor = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.15)';

            // Modern Glassmorphism Styling with Transitions
            overlay.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                display: flex;
                align-items: center;
                gap: 12px;
                background: ${bgColor};
                backdrop-filter: blur(12px) saturate(160%);
                -webkit-backdrop-filter: blur(12px) saturate(160%);
                padding: 10px 16px;
                border-radius: 60px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, ${isLight ? '0.15' : '0.4'});
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                border: 1px solid ${borderColor};
                transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                opacity: 0;
                transform: translateY(20px) scale(0.95);
                pointer-events: none;
                user-select: none;
                display: none;
            `;

            // Helper to create themed buttons
            function createThemedButton(text, tooltip) {
                const btn = document.createElement('button');
                btn.textContent = text;
                btn.title = tooltip;
                btn.style.cssText = `
                    background: ${btnBg};
                    border: 1px solid ${borderColor};
                    color: ${textColor};
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 15px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    outline: none;
                `;
                btn.onmouseover = () => {
                    btn.style.background = btnHoverBg;
                    btn.style.transform = 'translateY(-2px)';
                    btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                };
                btn.onmouseout = () => {
                    btn.style.background = btnBg;
                    btn.style.transform = 'translateY(0)';
                    btn.style.boxShadow = 'none';
                };
                return btn;
            }

            // 0. "Is this page safe?" (same AI check as the popup)
            const safeBtn = createThemedButton('', 'Is this page safe?');
            safeBtn.setAttribute('aria-label', 'Is this page safe?');
            safeBtn.innerHTML = SHIELD_SVG; // constant markup, no page or AI data
            safeBtn.onclick = () => checkThisPage(safeBtn, { isLight, textColor, bgColor, borderColor, mutedColor });

            // 1. Zoom Controls
            const zoomOutBtn = createThemedButton('Aa-', 'Decrease Text Size');
            zoomOutBtn.onclick = () => adjustZoom(-0.25);

            const zoomInBtn = createThemedButton('Aa+', 'Increase Text Size');
            zoomInBtn.onclick = () => adjustZoom(0.25);

            // 2. Settings/Shortcut
            const settingsBtn = createThemedButton('⚙️', 'Settings');
            settingsBtn.onclick = () => {
                try {
                    chrome.runtime.sendMessage({ command: "openOptions" });
                } catch (e) {
                    console.warn('[Senior SafeSurf] Could not open settings.');
                }
            };

            // Separator
            const separator = document.createElement('div');
            separator.style.cssText = `
                width: 1px;
                height: 24px;
                background: ${separatorColor};
                margin: 0 4px;
            `;

            // Close Button
            const closeBtn = document.createElement('div');
            closeBtn.innerHTML = '&times;';
            closeBtn.style.cssText = `
                color: ${mutedColor};
                font-size: 22px;
                cursor: pointer;
                line-height: 1;
                margin-left: 4px;
                transition: color 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
            `;
            closeBtn.onmouseover = () => closeBtn.style.color = textColor;
            closeBtn.onmouseout = () => closeBtn.style.color = mutedColor;
            closeBtn.onclick = () => {
                try {
                    hideOverlay();
                    chrome.storage.local.set({ showSeniorOverlay: false });
                } catch (e) {
                    console.warn('[Senior SafeSurf] Context invalidated, removing overlay.');
                    const el = document.getElementById(OVERLAY_ID);
                    if (el) el.remove();
                }
            };

            overlay.appendChild(zoomOutBtn);
            overlay.appendChild(zoomInBtn);
            overlay.appendChild(safeBtn);
            overlay.appendChild(settingsBtn);
            overlay.appendChild(separator);
            overlay.appendChild(closeBtn);

            document.body.appendChild(overlay);
            creating = false;
        });
    }

    function showOverlay() {
        let el = document.getElementById(OVERLAY_ID);
        if (!el) {
            createOverlay();
            // Need to wait for async theme fetch
            setTimeout(() => {
                el = document.getElementById(OVERLAY_ID);
                if (el) animateIn(el);
            }, 50);
            return;
        }
        animateIn(el);
    }

    function animateIn(el) {
        el.style.display = 'flex';
        el.style.zoom = (1 / currentZoom);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0) scale(1)';
                el.style.pointerEvents = 'auto';
            });
        });
    }

    function hideOverlay() {
        closeCheckCard();
        const el = document.getElementById(OVERLAY_ID);
        if (el) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px) scale(0.95)';
            el.style.pointerEvents = 'none';
            setTimeout(() => {
                if (el.style.opacity === '0') {
                    el.style.display = 'none';
                }
            }, 400);
        }
    }

    const ZOOM_STEP = 0.25;
    const MAX_ZOOM = 2.0;
    const MIN_ZOOM = 1.0;

    function adjustZoom(delta) {
        if (!document.body) return;

        let newZoom = currentZoom + delta;
        if (newZoom < MIN_ZOOM) newZoom = MIN_ZOOM;
        if (newZoom > MAX_ZOOM) newZoom = MAX_ZOOM;
        if (newZoom === currentZoom) return;

        currentZoom = newZoom;
        document.body.style.zoom = currentZoom;

        const el = document.getElementById(OVERLAY_ID);
        if (el) {
            el.style.zoom = (1 / currentZoom);
        }
        const card = document.getElementById(CHECK_ID);
        if (card) card.style.zoom = (1 / currentZoom);

        showZoomFeedback(`${Math.round(currentZoom * 100)}%`);
    }

    // ---------- "Is this page safe?" card ----------
    const CHECK_ID = 'safenet-senior-check';
    // Flat green shield with a check mark (inline SVG, no emoji).
    const SHIELD_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" style="display:block;flex-shrink:0">' +
        '<path d="M12 2 4 5v6.5c0 5.2 3.4 9.4 8 10.5 4.6-1.1 8-5.3 8-10.5V5l-8-3z" fill="#10b981"/>' +
        '<path d="m8.3 12.2 2.6 2.6 4.9-5.3" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';
    const HEADLINE = {
        allow: '✅ This page looks safe',
        warn: '⚠️ Be careful on this page',
        block: '⛔ This page is not safe',
        unknown: 'ℹ️ Could not check this page'
    };
    const ENGINE = {
        'on-device': 'Checked on this computer (Gemini Nano). Nothing was sent online.',
        cloud: 'Checked in the cloud (Gemini via Firebase).',
        keywords: 'Checked with your keyword list.'
    };
    const ACCENT = { allow: '#10b981', warn: '#f59e0b', block: '#ef4444', unknown: '#64748b' };

    function closeCheckCard() {
        const card = document.getElementById(CHECK_ID);
        if (card) card.remove();
    }

    function showCheckCard(theme, content) {
        closeCheckCard();
        const card = document.createElement('div');
        card.id = CHECK_ID;
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-live', 'polite');
        card.style.cssText = `
            position: fixed; right: 20px; bottom: 84px; width: 340px; max-width: calc(100vw - 40px);
            z-index: 2147483647; box-sizing: border-box; padding: 18px 20px 16px; border-radius: 20px;
            background: ${theme.bgColor}; color: ${theme.textColor};
            border: 2px solid ${ACCENT[content.verdict] || theme.borderColor};
            backdrop-filter: blur(12px) saturate(160%); -webkit-backdrop-filter: blur(12px) saturate(160%);
            box-shadow: 0 12px 40px rgba(0, 0, 0, ${theme.isLight ? '0.18' : '0.5'});
            font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: left;
            zoom: ${1 / currentZoom};
        `;
        const close = document.createElement('button');
        close.textContent = '×';
        close.title = 'Close';
        close.style.cssText = `position: absolute; top: 8px; right: 10px; background: none; border: 0; cursor: pointer;
            font-size: 22px; line-height: 1; color: ${theme.mutedColor};`;
        close.onclick = closeCheckCard;
        const head = document.createElement('div');
        head.style.cssText = 'font-size: 19px; font-weight: 800; margin: 0 22px 6px 0;';
        head.textContent = content.title;
        card.append(close, head);
        if (content.text) {
            const body = document.createElement('div');
            body.textContent = content.text; // AI text is never inserted as HTML
            card.appendChild(body);
        }
        if (content.meta) {
            const meta = document.createElement('div');
            meta.style.cssText = `font-size: 12px; margin-top: 8px; color: ${theme.mutedColor};`;
            meta.textContent = content.meta;
            card.appendChild(meta);
        }
        document.body.appendChild(card);
    }

    let checking = false;
    async function checkThisPage(btn, theme) {
        if (checking) return;
        checking = true;
        btn.textContent = '…';
        btn.style.color = '#10b981';
        btn.disabled = true;
        showCheckCard(theme, { verdict: 'unknown', title: 'Checking this page…', text: 'This takes a few seconds.' });
        try {
            const snapshot = SafeSurfSnapshot.build({ trigger: 'manual' });
            const v = (await chrome.runtime.sendMessage({ command: 'analyzePage', snapshot, trigger: 'manual' })) || {};
            const verdict = HEADLINE[v.verdict] ? v.verdict : 'unknown';
            const meta = [ENGINE[v.engine], v.escalated ? '(double-checked in the cloud)' : ''].filter(Boolean).join(' ');
            showCheckCard(theme, { verdict, title: HEADLINE[verdict], text: v.reason || '', meta });
        } catch (e) {
            showCheckCard(theme, { verdict: 'unknown', title: HEADLINE.unknown, text: 'Reload the page and try again.' });
        } finally {
            checking = false;
            btn.innerHTML = SHIELD_SVG;
            btn.disabled = false;
        }
    }

    function showZoomFeedback(text) {
        console.log(`[SafeNet] Zoom set to ${text}`);
    }

})();
