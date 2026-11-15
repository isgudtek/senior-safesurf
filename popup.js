// DOM Elements
const domainInput = document.getElementById('domainInput');
const addBtn = document.getElementById('addBtn');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');
const previewArea = document.getElementById('previewArea');

// Password UI Elements
const setupView = document.getElementById('setupView');
const unlockView = document.getElementById('unlockView');
const appView = document.getElementById('appView');
const newPasswordInput = document.getElementById('newPasswordInput');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');
const savePasswordBtn = document.getElementById('savePasswordBtn');
const unlockPasswordInput = document.getElementById('unlockPasswordInput');
const unlockBtn = document.getElementById('unlockBtn');

let blacklist = [];
let isUnlocked = false;
let isPro = false;
let pendingDomain = null;

// Load initial state on popup open
document.addEventListener('DOMContentLoaded', async () => {
    const result = await chrome.storage.local.get(['password', 'blacklist', 'isPro', 'lastView', 'showSeniorOverlay', 'themeMode']);
    blacklist = result.blacklist || [];
    isPro = result.isPro || false;

    // Apply theme
    applyTheme(result.themeMode || 'dark');

    if (result.password === undefined || result.password === '') {
        // No password or empty password, skip lock
        isUnlocked = true;
        showView('app');

        // Restore last view or default to dial
        const lastView = result.lastView || 'dial';
        showSubView(lastView);

        // Only capture if we are on the block view and just opened
        if (lastView === 'block') {
            captureCurrentTab();
        }
    } else {
        // Password exists, show unlock view
        showView('unlock');
        unlockPasswordInput.focus();
    }

    loadSpeedDialer();

    updateSassUI();

    // Listen for storage changes from other views (like options page)
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.blacklist) {
            blacklist = changes.blacklist.newValue || [];
            updateSassUI();
        }
        if (changes.isPro) {
            isPro = changes.isPro.newValue || false;
            updateSassUI();
        }
    });

    // Navigation switching
    document.getElementById('tab-dial').onclick = () => showSubView('dial');
    document.getElementById('tab-block').onclick = () => showSubView('block');

    const overlayToggle = document.getElementById('popupOverlayToggle');
    if (overlayToggle) {
        // Default to FALSE (unselected)
        overlayToggle.checked = result.showSeniorOverlay === true;

        overlayToggle.addEventListener('change', async () => {
            const isEnabled = overlayToggle.checked;

            // 1. Save globally (persists for this and other tabs)
            await chrome.storage.local.set({ showSeniorOverlay: isEnabled });

            // 2. Send instant message to ALL tabs for global responsiveness
            const tabs = await chrome.tabs.query({});
            tabs.forEach(tab => {
                if (tab && tab.id) {
                    chrome.tabs.sendMessage(tab.id, {
                        command: "toggleOverlay",
                        enabled: isEnabled
                    }).catch(() => {
                        // Ignore errors for tabs without content scripts
                    });
                }
            });
        });
    }
});

async function captureCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    // Filter out internal chrome pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return;

    const url = new URL(tab.url);
    // Capture domain + path + search (cleaned of protocol and www)
    let fullPath = url.hostname.replace(/^www\./, '') + url.pathname + url.search;

    // Remove trailing slash if it's just the root
    if (fullPath.endsWith('/')) {
        fullPath = fullPath.slice(0, -1);
    }

    // Pre-fill and trigger preview
    domainInput.value = fullPath;
    showSubView('block'); // Switch to blocker view so user sees the "Confirm" prompt
    addDomain(); // This will trigger the "Confirm?" state
}

async function updateSassUI() {
    const tierBadge = document.getElementById('tierBadge');
    const upgradeSection = document.getElementById('upgradeSection');

    // Elements for view-specific counts
    const blockCountEl = document.getElementById('blockCount');
    const blockLimitEl = document.getElementById('blockLimit');
    const dialCountEl = document.getElementById('dialCount');
    const dialLimitEl = document.getElementById('dialLimit');
    const dialStatusEl = document.getElementById('dialStatus');

    // Get current state
    const res = await chrome.storage.local.get(['speedDialer', 'isPro']);
    const dialer = Array.isArray(res.speedDialer) ? res.speedDialer : [];
    const filledSlots = dialer.filter(item => item && item.url).length;

    if (isPro) {
        tierBadge.textContent = 'PRO';
        tierBadge.className = 'tier-badge pro';

        if (blockLimitEl) blockLimitEl.textContent = '∞';
        if (upgradeSection) upgradeSection.classList.add('hidden');

        // Hide bookmark status for PRO
        if (dialStatusEl) dialStatusEl.style.display = 'none';
    } else {
        tierBadge.textContent = 'FREE';
        tierBadge.className = 'tier-badge free';

        if (blockLimitEl) blockLimitEl.textContent = '3';

        if (blacklist.length >= 3) {
            if (upgradeSection) upgradeSection.classList.remove('hidden');
        } else {
            if (upgradeSection) upgradeSection.classList.add('hidden');
        }

        // Show bookmark status for FREE
        if (dialStatusEl) {
            dialStatusEl.style.display = 'block';
            const remainingEl = document.getElementById('bookmarksRemaining');
            if (remainingEl) {
                const remaining = 3 - filledSlots;
                remainingEl.textContent = remaining > 0 ? remaining : 0;
            }
        }
    }

    if (blockCountEl) blockCountEl.textContent = blacklist.length;
}

// Setup Password logic
const handleSavePassword = async () => {
    const pass = newPasswordInput.value.trim();
    const confirmPass = confirmPasswordInput.value.trim();

    // Simplified for testing: allow any password (including empty)

    if (pass !== confirmPass) {
        showStatus(i18nCustom.t("alert_pass_match_error"), 'warning');
        return;
    }

    await chrome.storage.local.set({ password: pass });
    isUnlocked = true;
    showView('app');
    domainInput.focus(); // Focus main input after setup
    showStatus(i18nCustom.t("alert_pass_set_success"), 'success');
};

savePasswordBtn.addEventListener('click', handleSavePassword);
newPasswordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') confirmPasswordInput.focus(); });
confirmPasswordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSavePassword(); });

// Unlock Logic
const handleUnlock = async () => {
    const inputPass = unlockPasswordInput.value.trim();
    const result = await chrome.storage.local.get(['password']);

    if (inputPass === result.password) {
        isUnlocked = true;
        showView('app');
        captureCurrentTab(); // Capture tab after manual unlock
        showStatus(i18nCustom.t("alert_unlocked"), 'success');
    } else {
        showStatus(i18nCustom.t("alert_wrong_password"), 'warning');
        unlockPasswordInput.value = '';
    }
};

unlockBtn.addEventListener('click', handleUnlock);
unlockPasswordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUnlock(); });

function showView(view) {
    setupView.classList.add('hidden');
    unlockView.classList.add('hidden');
    appView.classList.add('hidden');

    if (view === 'setup') setupView.classList.remove('hidden');
    else if (view === 'unlock') unlockView.classList.remove('hidden');
    else if (view === 'app') {
        appView.classList.remove('hidden');
    }
}

async function showSubView(subView) {
    // Hide all sections
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    // Show target
    const targetSection = document.getElementById(`view-${subView}`);
    const targetTab = document.getElementById(`tab-${subView}`);

    if (targetSection && targetTab) {
        targetSection.classList.add('active');
        targetTab.classList.add('active');
        // Remember location
        await chrome.storage.local.set({ lastView: subView });
    }
}

// Add domain on button click
addBtn.addEventListener('click', addDomain);

// Add domain on Enter key
domainInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addDomain();
});

// Reset confirmation if input changes
domainInput.addEventListener('input', () => {
    if (pendingDomain) {
        pendingDomain = null;
        addBtn.textContent = 'Add';
        addBtn.classList.remove('confirm-state');
        previewArea.classList.add('hidden');
    }
});

async function addDomain() {
    if (!isUnlocked) return;

    if (!isPro && blacklist.length >= 3) {
        showStatus(i18nCustom.t("alert_limit_reached"), 'warning');
        updateSassUI();
        return;
    }

    const domain = domainInput.value.trim().toLowerCase();

    // Validate domain
    if (!domain) return;

    // Clean domain (remove http://, https://)
    const cleanDomain = domain
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, ''); // Remove trailing slash

    if (blacklist.includes(cleanDomain)) {
        showStatus(i18nCustom.t("alert_already_in_list"), 'warning');
        return;
    }

    // Step 1: Show Preview & Confirmation
    if (pendingDomain !== cleanDomain) {
        pendingDomain = cleanDomain;
        addBtn.textContent = i18nCustom.t("alert_confirm_add");
        addBtn.style.background = 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)';

        let hint = "";
        if (cleanDomain.includes('/')) {
            hint = `Blocks <strong>exact path</strong>: ${cleanDomain} and its sub-pages.`;
        } else if (!cleanDomain.includes('.')) {
            hint = `<strong>Universal Block</strong>: Blocks "${cleanDomain}" across <strong>ALL</strong> extensions (.com, .net, .org, etc.).`;
        } else if (cleanDomain.startsWith('www.')) {
            const root = cleanDomain.replace(/^www\./, '');
            hint = `Blocks <strong>${root}</strong> and <strong>www.${root}</strong> ONLY. Other subdomains stay open.`;
        } else {
            hint = `Blocks <strong>${cleanDomain}</strong> and <strong>ALL subdomains</strong> (mail, drive, etc.).`;
        }

        previewArea.innerHTML = hint;
        previewArea.classList.remove('hidden');
        return;
    }

    // Step 2: Proceed with addition
    blacklist.push(cleanDomain);
    await chrome.storage.local.set({ blacklist });

    // Reset UI
    pendingDomain = null;
    addBtn.textContent = 'Add';
    addBtn.style.background = ''; // Resets to CSS default
    previewArea.classList.add('hidden');

    // Update blocking rules
    chrome.runtime.sendMessage({ command: "updateRules" }, (response) => {
        if (response?.status === "success") {
            showStatus(i18nCustom.t("alert_blocking_domain", [cleanDomain]), 'success');
        }
    });

    domainInput.value = '';
    domainInput.focus(); // Return focus for rapid entry
    updateSassUI();
}

// Event Listeners for new UI
document.getElementById('manageLinksBtn').addEventListener('click', () => openOptions('domains'));

// SaaS Logic: Open Options Page
const openOptions = (section = 'general') => {
    const url = chrome.runtime.getURL(`options.html#${section}`);
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(url);
    }
};

document.getElementById('settingsBtn').addEventListener('click', () => openOptions('domains'));
document.getElementById('openOptions').addEventListener('click', () => openOptions('general'));

function showStatus(message, type = 'success') {
    // UI status element removed as per user request. 
    // We can still log to console or use a more subtle Toast later if needed.
    console.log(`[Status] ${message} (${type})`);
}

async function loadSpeedDialer() {
    const res = await chrome.storage.local.get(['speedDialer', 'dialerEnabled', 'isPro']);
    const container = document.getElementById('speedDialerContainer');
    const section = container?.closest('.speed-dialer');
    if (!container) return;

    if (res.dialerEnabled === false) {
        if (section) section.style.display = 'none';
        return;
    } else {
        if (section) section.style.display = 'block';
    }

    const isProUser = res.isPro || false;
    let dialer = res.speedDialer || [];

    // Ensure dialer is an array
    if (!Array.isArray(dialer)) dialer = [];

    container.innerHTML = '';

    // Always show at least 9 slots for layout consistency
    let slotCount = isProUser ? Math.max(9, dialer.length + 1) : 9;

    for (let i = 0; i < slotCount; i++) {
        const item = dialer[i];
        const btn = document.createElement('button');

        // Determine if slot is locked for free users (indices 3-8)
        const isLockedForFree = !isProUser && i >= 3;

        btn.style.cssText = `
            background: ${isLockedForFree ? 'rgba(15, 23, 42, 0.4)' : 'rgba(30, 41, 59, 0.5)'};
            border: 1px solid var(--border);
            color: var(--text-main);
            padding: 12px;
            border-radius: 18px;
            font-size: 13px;
            font-weight: 600;
            cursor: ${isLockedForFree ? 'default' : 'pointer'};
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            aspect-ratio: 1 / 1;
            width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            opacity: ${isLockedForFree ? '0.4' : '1'};
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
        `;

        if (item) {
            // Occupied Slot
            try {
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=32`;
                btn.innerHTML = `
                    <img src="${faviconUrl}" style="width:24px; height:24px;">
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${item.name}</span>
                `;
            } catch (e) {
                btn.innerHTML = `<span>${item.name}</span>`;
            }
            btn.onclick = () => {
                chrome.tabs.create({ url: item.url });
            };
        } else if (isLockedForFree) {
            // Locked Slot for Free Users
            btn.innerHTML = `<span style="font-size: 18px; color: var(--pro);">PRO</span>`;
            btn.onclick = () => {
                showStatus("Upgrade to PRO for more slots", "warning");
                openOptions('general');
            };
        } else {
            // Available Empty Slot
            btn.innerHTML = `<span style="font-size: 32px; color: var(--text-muted); opacity: 0.5;">+</span>`;
            btn.onclick = () => captureSpecificSlot(i, btn);
        }

        if (!isLockedForFree) {
            btn.onmouseover = () => { btn.style.borderColor = 'var(--primary)'; btn.style.background = '#334155'; };
            btn.onmouseout = () => {
                // Do not reset if in confirmation state
                if (!btn.classList.contains('confirm-state')) {
                    btn.style.borderColor = 'var(--border)';
                    btn.style.background = '#1e293b';
                }
            };
        }

        container.appendChild(btn);
    }
}

let slotCaptureTimeout = null;

async function captureSpecificSlot(index, btn) {
    // Stage 1: Capture current tab and show "Confirm?"
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || tab.url.startsWith('chrome://')) {
        showStatus(i18nCustom.t("alert_cannot_capture"), "warning");
        return;
    }

    const currentTitle = tab.title || "New Site";
    const currentUrl = tab.url;

    // Change button to confirmation state
    const originalHTML = btn.innerHTML;
    const originalStyle = btn.style.cssText;

    btn.classList.add('confirm-state');
    btn.innerHTML = `<span style="font-size: 14px; color: #fff; font-weight: 800;">CONFIRM?</span><span style="font-size: 10px; color: #fff; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${currentTitle}</span>`;
    btn.style.background = 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)';
    btn.style.borderColor = '#f59e0b';
    btn.style.color = '#fff';

    // Reset after 5 seconds if not confirmed
    if (slotCaptureTimeout) clearTimeout(slotCaptureTimeout);
    slotCaptureTimeout = setTimeout(() => {
        btn.classList.remove('confirm-state');
        btn.innerHTML = originalHTML;
        btn.style.cssText = originalStyle;
        btn.onclick = () => captureSpecificSlot(index, btn);
    }, 5000);

    // Stage 2: Confirm and Save
    btn.onclick = async () => {
        clearTimeout(slotCaptureTimeout);
        const res = await chrome.storage.local.get(['speedDialer']);
        let dialer = res.speedDialer || [];
        if (!Array.isArray(dialer)) dialer = [];

        dialer[index] = {
            name: currentTitle,
            url: currentUrl
        };

        await chrome.storage.local.set({ speedDialer: dialer });
        showStatus(i18nCustom.t("alert_saved_dial"), "success");
        loadSpeedDialer(); // Refresh grid
    };
}

// Theme Application
function applyTheme(mode) {
    let effectiveTheme = mode;
    if (mode === 'auto') {
        effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effectiveTheme);
}
