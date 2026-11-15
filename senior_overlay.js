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

    function createOverlay() {
        if (!document.body) return;
        if (document.getElementById(OVERLAY_ID)) return;

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
            overlay.appendChild(settingsBtn);
            overlay.appendChild(separator);
            overlay.appendChild(closeBtn);

            document.body.appendChild(overlay);
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

        showZoomFeedback(`${Math.round(currentZoom * 100)}%`);
    }

    function showZoomFeedback(text) {
        console.log(`[SafeNet] Zoom set to ${text}`);
    }

})();
