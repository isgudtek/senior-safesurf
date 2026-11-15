let blacklist = [];
let stopWords = [];
let hasPassword = false;
let isUnlockedInSession = false;
const SUPPORT_EMAIL = 'tazzcderq@gmail.com';
let selectedBgUrl = '';
let currentCategory = 'abstract';
let currentPage = 1;

document.addEventListener('DOMContentLoaded', async () => {
    const result = await chrome.storage.local.get([
        'blacklist', 'password', 'customBackground',
        'enableBypass', 'enableContentFilter', 'stopWords', 'masterEnabled',
        'dialerEnabled', 'blockingEnabled', 'parentalEnabled', 'showSeniorOverlay'
    ]);
    blacklist = result.blacklist || [];
    stopWords = result.stopWords || [];
    hasPassword = !!result.password;
    selectedBgUrl = result.customBackground || '';

    const bypassToggle = document.getElementById('bypassToggle');
    if (bypassToggle) {
        bypassToggle.checked = result.enableBypass === true; // Default to false
        bypassToggle.addEventListener('change', async () => {
            await chrome.storage.local.set({ enableBypass: bypassToggle.checked });
        });
    }

    // Feature Toggles
    const dialerToggle = document.getElementById('dialerEnabledToggle');
    if (dialerToggle) {
        dialerToggle.checked = result.dialerEnabled !== false;
        dialerToggle.addEventListener('click', (e) => e.stopPropagation()); // Prevent nav switch
        dialerToggle.addEventListener('change', async () => {
            await chrome.storage.local.set({ dialerEnabled: dialerToggle.checked });
        });
    }

    const blockingToggle = document.getElementById('blockingEnabledToggle');
    if (blockingToggle) {
        blockingToggle.checked = result.blockingEnabled !== false;
        blockingToggle.addEventListener('click', (e) => e.stopPropagation()); // Prevent nav switch
        blockingToggle.addEventListener('change', async () => {
            await chrome.storage.local.set({ blockingEnabled: blockingToggle.checked });
            chrome.runtime.sendMessage({ command: "updateRules" });
        });
    }

    const parentalToggle = document.getElementById('parentalEnabledToggle');
    if (parentalToggle) {
        parentalToggle.checked = result.parentalEnabled !== false;
        parentalToggle.addEventListener('click', (e) => e.stopPropagation()); // Prevent nav switch
        parentalToggle.addEventListener('change', async () => {
            await chrome.storage.local.set({ parentalEnabled: parentalToggle.checked });
        });
    }

    const overlayToggle = document.getElementById('overlayEnabledToggle');
    if (overlayToggle) {
        overlayToggle.checked = result.showSeniorOverlay === true; // Default false
        overlayToggle.addEventListener('change', async () => {
            const isEnabled = overlayToggle.checked;
            await chrome.storage.local.set({ showSeniorOverlay: isEnabled });

            // Broadcast to all tabs
            const tabs = await chrome.tabs.query({});
            tabs.forEach(tab => {
                if (tab && tab.id) {
                    chrome.tabs.sendMessage(tab.id, {
                        command: "toggleOverlay",
                        enabled: isEnabled
                    }).catch(() => { });
                }
            });
        });
    }

    renderOptionsList();
    setupNavigation();
    setupSecurityUI();
    setupAppearanceUI();

    const filterToggle = document.getElementById('contentFilterToggle');
    if (filterToggle) {
        filterToggle.checked = !!result.enableContentFilter;
        toggleFilterSettings(filterToggle.checked);
        filterToggle.addEventListener('click', async (e) => {
            if (!(await checkSecurity())) {
                e.preventDefault();
                return;
            }
            // Toggle state actually changes after click, so we need to handle it carefully or just rely on change
            // But 'click' is better for preventing the visual toggle if cancelled. 
            // Actually, let's use 'click' to intercept.
        });

        filterToggle.addEventListener('change', async () => {
            await chrome.storage.local.set({ enableContentFilter: filterToggle.checked });
            toggleFilterSettings(filterToggle.checked);
        });
    }
    setupParentalUI();
    setupSupportUI();
    setupDialerUI();

    // Add Rule Logic (Dashboard)
    const addRuleBtn = document.getElementById('optionsAddBtn');
    if (addRuleBtn) addRuleBtn.addEventListener('click', handleAddDomain);

    const domainInput = document.getElementById('optionsDomainInput');
    if (domainInput) {
        domainInput.addEventListener('input', handlePreview);
        domainInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && addRuleBtn) addRuleBtn.click();
        });
    }

    // Password Update/Set
    const updatePassBtn = document.getElementById('updatePasswordBtn');
    if (updatePassBtn) updatePassBtn.addEventListener('click', handleUpdatePassword);

    // Portability Logic
    document.getElementById('exportBtn').addEventListener('click', handleExport);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', handleImport);

    // Password Warning Box Logic
    const passwordWarningBox = document.getElementById('passwordWarningBox');
    const dismissWarningDismissed = localStorage.getItem('passwordWarningDismissed');

    if (passwordWarningBox && !hasPassword && !dismissWarningDismissed) {
        passwordWarningBox.classList.remove('hidden');
    }

    const dismissBtn = document.getElementById('dismissPasswordWarning');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            localStorage.setItem('passwordWarningDismissed', 'true');
            passwordWarningBox.classList.add('hidden');
        });
    }

    const goToSecurityLink = document.getElementById('goToSecurityLink');
    if (goToSecurityLink) {
        goToSecurityLink.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.setItem('activeOptionsTab', 'security');
            document.querySelector('.nav-item[data-section="security"]').click();
        });
    }

    // Language Selection
    const langSelect = document.getElementById('appLanguageSelect');
    if (langSelect) {
        chrome.storage.local.get(['appLanguage'], (data) => {
            langSelect.value = data.appLanguage || 'en';
        });
        langSelect.addEventListener('change', async () => {
            const newLang = langSelect.value;
            await chrome.storage.local.set({ appLanguage: newLang });
            // Load the new language messages
            if (typeof i18nCustom !== 'undefined') {
                await i18nCustom.load(newLang);
            }
            // Apply translations immediately
            if (window.applyTranslations) {
                await applyTranslations();
            }
            alert(i18nCustom.t("alert_language_saved") || "Language updated. Please reload for full effect.");
        });
    }
});

// Navigation logic (Tabs)
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');

    const switchTab = (target) => {
        // Tabs that no longer exist (e.g. the old "ai" tab, now part of Instructions) fall back to Instructions.
        if (!document.getElementById(`section-${target}`)) target = 'instructions';
        navItems.forEach(i => i.classList.remove('active'));
        const activeNav = document.querySelector(`.nav-item[data-section="${target}"]`);
        if (activeNav) activeNav.classList.add('active');

        sections.forEach(s => {
            if (s.id === `section-${target}`) {
                s.classList.remove('hidden');
            } else {
                s.classList.add('hidden');
            }
        });

        // Persist active tab
        localStorage.setItem('activeOptionsTab', target);
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Do not switch tab if clicking the switch inside the nav-item
            if (e.target.closest('.switch')) return;
            const target = item.getAttribute('data-section');
            switchTab(target);
        });
    });

    // Handle initial tab: localStorage > hash > default
    const savedTab = localStorage.getItem('activeOptionsTab');
    const hash = window.location.hash.replace('#', '');
    const initialTab = hash || savedTab || 'instructions';
    switchTab(initialTab);

}

// Rule Description Generator
function getRuleDescription(entry) {
    if (entry.includes('/')) {
        return i18nCustom.t("rule_desc_path");
    } else if (!entry.includes('.')) {
        return i18nCustom.t("rule_desc_universal", [entry]);
    } else {
        return i18nCustom.t("rule_desc_domain", [entry]);
    }
}

// Add/Edit management logic
function renderOptionsList() {
    const listEl = document.getElementById('optionsDomainList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (blacklist.length === 0) {
        listEl.innerHTML = '<div style="color: #64748b; text-align: center; padding: 20px;">No active rules. Add one above!</div>';
        return;
    }

    blacklist.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'options-item';
        item.innerHTML = `
            <div class="info">
                <span class="name" id="name-${index}">${entry}</span>
                <span class="description">${getRuleDescription(entry)}</span>
            </div>
            <div class="actions">
                <button class="btn-action btn-edit" data-index="${index}">Edit</button>
                <button class="btn-action btn-delete" data-index="${index}">Remove</button>
            </div>
        `;
        listEl.appendChild(item);
    });

    // Add listeners
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!(await checkSecurity())) return;
            const index = btn.getAttribute('data-index');
            const domain = blacklist[index];
            blacklist.splice(index, 1);
            await chrome.storage.local.set({ blacklist });
            chrome.runtime.sendMessage({ command: "updateRules" });
            renderOptionsList();
        });
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!(await checkSecurity())) return;
            handleEdit(btn.getAttribute('data-index'));
        });
    });
}

function handlePreview() {
    const input = document.getElementById('optionsDomainInput');
    const preview = document.getElementById('optionsPreview');
    const val = input.value.trim().toLowerCase();

    if (val) {
        preview.innerHTML = getRuleDescription(val);
        preview.classList.remove('hidden');
    } else {
        preview.classList.add('hidden');
    }
}

async function handleAddDomain() {
    if (!(await checkSecurity())) return;
    const input = document.getElementById('optionsDomainInput');
    const domain = input.value.trim().toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '');

    if (!domain) return;
    if (blacklist.includes(domain)) {
        alert(i18nCustom.t("alert_already_in_list"));
        return;
    }
    blacklist.push(domain);
    await chrome.storage.local.set({ blacklist });
    chrome.runtime.sendMessage({ command: "updateRules" });

    input.value = '';
    document.getElementById('optionsPreview').classList.add('hidden');
    input.focus();
    renderOptionsList();
}

function handleEdit(index) {
    const nameSpan = document.getElementById(`name-${index}`);
    if (!nameSpan) return; // Safeguard
    const oldVal = blacklist[index];

    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldVal;
    input.style.width = '100%';
    input.style.padding = '4px 8px';
    input.style.background = '#1e293b';
    input.style.border = '1px solid #4ade80';
    input.style.borderRadius = '4px';
    input.style.color = '#fff';

    nameSpan.innerHTML = '';
    nameSpan.appendChild(input);
    input.focus();

    const saveEffect = async () => {
        const newVal = input.value.trim().toLowerCase();
        if (newVal && newVal !== oldVal) {
            blacklist[index] = newVal;
            await chrome.storage.local.set({ blacklist });
            chrome.runtime.sendMessage({ command: "updateRules" });
        }
        renderOptionsList();
    };

    input.addEventListener('blur', saveEffect);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveEffect(); });
}

// Security management logic
function setupSecurityUI() {
    const title = document.getElementById('securityTitle');
    const desc = document.getElementById('securityDesc');
    const currentPassGroup = document.getElementById('currentPassGroup');
    const btn = document.getElementById('updatePasswordBtn');
    const bypassToggle = document.getElementById('bypassToggle');

    if (hasPassword) {
        if (title) title.textContent = 'Update Master Password';
        if (desc) {
            desc.innerHTML = 'Modify the password required to unlock the extension settings and bypass rules.';
            desc.style.color = '#94a3b8';
        }
        if (currentPassGroup) currentPassGroup.classList.remove('hidden');
        if (btn) btn.textContent = 'Update Password';
        if (bypassToggle) {
            bypassToggle.disabled = false;
            bypassToggle.parentElement.style.opacity = '1';
            bypassToggle.parentElement.title = '';
        }
    } else {
        title.textContent = 'Set Master Password';
        desc.innerHTML = '<span style="color: #ef4444; font-weight: 700;">⚠️ UNSAFE:</span> No password set. Anyone can edit your rules. <br><span style="margin-top: 4px; display: inline-block;">Set a password to enable "Temporary Access" and protect your focus.</span>';
        if (currentPassGroup) currentPassGroup.classList.add('hidden');
        if (btn) btn.textContent = 'Set Password';

        // Disable bypass if no password
        if (bypassToggle) {
            bypassToggle.checked = false;
            bypassToggle.disabled = true;
            bypassToggle.parentElement.style.opacity = '0.5';
            bypassToggle.parentElement.title = 'You must set a master password before enabling temporary access.';
            chrome.storage.local.set({ enableBypass: false });
        }
    }
}

async function handleUpdatePassword() {
    const currentPass = document.getElementById('currentPasswordInput').value;
    const newPass = document.getElementById('newOptionsPasswordInput').value;
    const confirmPass = document.getElementById('confirmOptionsPasswordInput').value;

    if (newPass !== confirmPass) {
        alert(i18nCustom.t("alert_pass_mismatch"));
        return;
    }

    if (hasPassword && !(await SafeSurfSecurity.check(currentPass))) {
        alert(i18nCustom.t("alert_curr_pass_wrong"));
        return;
    }

    if (newPass === '') {
        const confirmRemove = confirm(i18nCustom.t("confirm_remove_password"));
        if (!confirmRemove) return;
        await chrome.storage.local.remove('password');
        hasPassword = false;
        alert(i18nCustom.t("alert_pass_removed"));
    } else {
        await chrome.storage.local.set({ password: await SafeSurfSecurity.toStored(newPass) });
        hasPassword = true;
        alert(i18nCustom.t("alert_pass_saved"));
    }

    document.getElementById('currentPasswordInput').value = '';
    document.getElementById('newOptionsPasswordInput').value = '';
    document.getElementById('confirmOptionsPasswordInput').value = '';
    setupSecurityUI();
}

// Portability Implementation
async function handleExport() {
    if (!(await checkSecurity())) return;
    const data = JSON.stringify({
        version: "1.3",
        blacklist: blacklist,
        exportedAt: new Date().toISOString()
    }, null, 2);

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safenet_senior_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        if (!(await checkSecurity())) {
            e.target.value = '';
            return;
        }
        try {
            const data = JSON.parse(event.target.result);
            if (!data.blacklist || !Array.isArray(data.blacklist)) {
                throw new Error("Invalid format");
            }

            const newBlacklist = data.blacklist.filter((x) => typeof x === 'string' && x.trim());
            blacklist = [...new Set([...blacklist, ...newBlacklist])];

            await chrome.storage.local.set({ blacklist });
            chrome.runtime.sendMessage({ command: "updateRules" });
            renderOptionsList();
            alert(i18nCustom.t("alert_import_success"));

        } catch (error) {
            alert(i18nCustom.t("alert_import_failed"));
        }
        // Reset file input
        e.target.value = '';
    };
    reader.readAsText(file);
}

// Global Synchronization
chrome.storage.onChanged.addListener((changes) => {
    if (changes.blacklist) {
        blacklist = changes.blacklist.newValue || [];
        renderOptionsList();
    }
    if (changes.password) {
        hasPassword = !!changes.password.newValue; // Handle undefined, null, or empty string
        setupSecurityUI();
    }
});

async function checkSecurity() {
    if (!hasPassword || isUnlockedInSession) return true;
    const pass = prompt(i18nCustom.t("prompt_enter_password"));
    if (pass !== null && await SafeSurfSecurity.check(pass)) {
        isUnlockedInSession = true;
        return true;
    }
    if (pass !== null) alert(i18nCustom.t("alert_wrong_password"));
    return false;
}

// Appearance / Pexels Logic
function setupAppearanceUI() {
    const categoryBtns = document.querySelectorAll('.category-btn[data-category]');
    const themeBtns = document.querySelectorAll('#themeSelector .category-btn');
    const nextBtn = document.getElementById('nextBgBtn');
    const prevBtn = document.getElementById('prevBgBtn');

    // --- Theme Selector Logic ---
    chrome.storage.local.get(['themeMode'], (res) => {
        const savedTheme = res.themeMode || 'dark';
        applyTheme(savedTheme);
        themeBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-theme') === savedTheme) {
                btn.classList.add('active');
            }
        });
    });

    themeBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const theme = btn.getAttribute('data-theme');
            themeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            await chrome.storage.local.set({ themeMode: theme });
            applyTheme(theme);
        });
    });

    // --- Background Category Logic ---
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentCategory = btn.getAttribute('data-category');
            currentPage = 1;
            categoryBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            fetchBackgrounds(currentCategory, currentPage);
        });
    });

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentPage++;
            fetchBackgrounds(currentCategory, currentPage);
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                fetchBackgrounds(currentCategory, currentPage);
            }
        });
    }

    // Load initial category
    const activeBtn = document.querySelector('.category-btn[data-category="abstract"]');
    if (activeBtn) {
        activeBtn.classList.add('active'); // Ensure visual state
        fetchBackgrounds('abstract', 1);
    } else if (categoryBtns.length > 0) {
        categoryBtns[0].click();
    }
}

// Theme Application
function applyTheme(mode) {
    let effectiveTheme = mode;
    if (mode === 'auto') {
        effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effectiveTheme);
}

async function fetchBackgrounds(query, page = 1) {
    const loader = document.getElementById('bgLoader');
    const grid = document.getElementById('bgGrid');
    const pageInfo = document.getElementById('pageInfo');
    const nextBtn = document.getElementById('nextBgBtn');
    const prevBtn = document.getElementById('prevBgBtn');

    if (loader) loader.classList.remove('hidden');
    if (grid) grid.innerHTML = '';
    if (pageInfo) pageInfo.textContent = `Page ${page}`;

    try {
        // Pexels search runs in the AI engine page; its API key comes from Firebase Remote Config.
        const data = await chrome.runtime.sendMessage({ command: 'pexelsSearch', query, page, perPage: 14 });
        if (!data || data.error) throw new Error((data && data.error) || 'no answer');
        data.next_page = data.nextPage;

        loader.classList.add('hidden');

        // Update pagination buttons
        if (prevBtn) prevBtn.disabled = page === 1;
        if (nextBtn) nextBtn.disabled = !data.next_page;

        // Prepend Random block
        const randomItem = document.createElement('div');
        const isRandomSelected = selectedBgUrl === `random:${query}`;
        randomItem.className = 'bg-item' + (isRandomSelected ? ' selected' : '');
        randomItem.style.display = 'flex';
        randomItem.style.alignItems = 'center';
        randomItem.style.justifyContent = 'center';
        randomItem.style.background = 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
        randomItem.style.border = isRandomSelected ? '2px solid var(--primary)' : '2px dashed var(--border)';

        let randomHtml = `
            <div style="text-align: center;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" style="margin-bottom: 8px;">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
                    <polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
                    <polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                <div style="font-size: 12px; font-weight: 700; color: var(--primary);">RANDOM</div>
            </div>
        `;

        randomItem.innerHTML = randomHtml;
        randomItem.addEventListener('click', async () => {
            document.querySelectorAll('.bg-item').forEach(i => i.classList.remove('selected'));
            randomItem.classList.add('selected');
            selectedBgUrl = `random:${query}`;
            await chrome.storage.local.set({ customBackground: selectedBgUrl });
        });
        grid.appendChild(randomItem);

        if (data.photos && data.photos.length > 0) {
            data.photos.forEach((photo, index) => {
                const item = document.createElement('div');
                const isExplicitlySelected = selectedBgUrl === photo.src.large2x;

                item.className = 'bg-item' + (isExplicitlySelected ? ' selected' : '');
                const img = document.createElement('img');
                img.src = photo.src.medium;
                img.alt = photo.alt || '';
                item.appendChild(img);

                item.addEventListener('click', async () => {
                    document.querySelectorAll('.bg-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    selectedBgUrl = photo.src.large2x;
                    await chrome.storage.local.set({
                        customBackground: selectedBgUrl,
                        bgAuthorName: photo.photographer,
                        bgAuthorUrl: photo.photographer_url
                    });
                });

                grid.appendChild(item);
            });
        }
    } catch (error) {
        loader.classList.add('hidden');
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ef4444;">Error fetching images. Please check your connection.</div>';
    }
}

// Parental Control / Content Filter Logic
function toggleFilterSettings(enabled) {
    const settings = document.getElementById('contentFilterSettings');
    if (settings) {
        if (enabled) settings.classList.remove('hidden');
        else settings.classList.add('hidden');
    }
}

const PRESET_WORDS = {
    en: ["porn", "xvideos", "pornhub", "redtube", "xnxx", "youporn", "brazzers", "bangbros", "nsfw", "hentai", "sexy", "adult", "xxx", "sex", "erotica", "nudity", "hardcore", "milf", "camgirl", "chaturbate", "gambling", "casino", "poker", "betting", "bet365", "roulette", "blackjack", "slotmachine", "gore", "violence", "blood", "death", "killing", "murder", "execution", "torture", "drugs", "cocaine", "heroin", "meth", "weed", "cannabis", "marijuana", "overdose", "weapon", "gun", "pistol", "rifle", "ammunition", "explosive", "bomb", "terrorism", "hate", "racism", "nazi", "supremacy", "extremism", "propaganda", "radical", "scam", "phishing", "malware", "virus", "hacker", "darkweb", "onion", "tor", "vagina", "penis", "clitoris", "anus", "testicle", "intercourse", "ejaculation", "fetish", "bondage", "bdsm", "kink", "dominatrix", "voyeur", "escort", "hooker", "prostitute", "brothel", "prostitution", "trafficking", "incest", "pedophile"],
    it: ["porno", "xvideos", "pornhub", "redtube", "xnxx", "youporn", "brazzers", "bangbros", "nsfw", "hentai", "sexy", "adulti", "xxx", "sesso", "erotico", "nudo", "hardcore", "milf", "camgirl", "chaturbate", "azzardo", "casino", "poker", "scommesse", "bet365", "roulette", "blackjack", "slotmachine", "violenza", "sangue", "morte", "uccisione", "omicidio", "esecuzione", "tortura", "droga", "cocaina", "eroina", "erba", "cannabis", "marijuana", "overdose", "arma", "pistola", "fucile", "munizioni", "esplosivo", "bomba", "terrorismo", "odio", "razzismo", "nazi", "estremismo", "propaganda", "radicale", "truffa", "phishing", "malware", "virus", "hacker", "darkweb", "onion", "tor", "vagina", "pene", "clitoride", "ano", "testicolo", "rapporto", "eiaculazione", "fetish", "bondage", "bdsm", "kink", "dominatrice", "voyeur", "escort", "prostituta", "bordello", "prostituzione", "tratta", "incesto", "pedofilo", "troia", "puttana", "merda"],
    fr: ["porno", "xvideos", "pornhub", "redtube", "xnxx", "youporn", "brazzers", "bangbros", "nsfw", "hentai", "sexy", "adulte", "xxx", "sexe", "érotique", "nudité", "hardcore", "milf", "camgirl", "chaturbate", "jeu", "casino", "poker", "pari", "bet365", "roulette", "blackjack", "machineasous", "gore", "violence", "sang", "mort", "tuerie", "meurtre", "exécution", "torture", "drogues", "cocaïne", "héroïne", "cannabis", "marijuana", "overdose", "arme", "pistolet", "fusil", "munitions", "explosif", "bombe", "terrorisme", "haine", "racisme", "nazi", "suprématie", "extrémisme", "propagande", "radical", "arnaque", "phishing", "malware", "virus", "hacker", "darkweb", "onion", "tor", "vagin", "pénis", "clitoris", "anus", "testicule", "rapport", "éjaculation", "fétiche", "bondage", "bdsm", "kink", "dominatrice", "voyeur", "escorte", "prostituée", "bordel", "prostitution", "trafic", "inceste", "pédophile"],
    es: ["porno", "xvideos", "pornhub", "redtube", "xnxx", "youporn", "brazzers", "bangbros", "nsfw", "hentai", "sexy", "adulto", "xxx", "sexo", "erotica", "desnudo", "hardcore", "milf", "camgirl", "chaturbate", "juego", "casino", "poker", "apuestas", "bet365", "ruleta", "blackjack", "tragaperras", "gore", "violencia", "sangre", "muerte", "matar", "asesinato", "ejecución", "tortura", "drogas", "cocaína", "heroína", "hierba", "cannabis", "marihuana", "sobredosis", "arma", "pistola", "rifle", "municiones", "explosivo", "bomba", "terrorismo", "odio", "racismo", "nazi", "supremacía", "extremismo", "propaganda", "radical", "estafa", "phishing", "malware", "virus", "hacker", "darkweb", "onion", "tor", "vagina", "pene", "clítoris", "ano", "testículo", "coito", "eyaculación", "fetiche", "bondage", "bdsm", "kink", "dominatriz", "voyeur", "escort", "prostituta", "burdel", "prostitución", "trata", "incesto", "pedófilo"],
    de: ["porno", "xvideos", "pornhub", "redtube", "xnxx", "youporn", "brazzers", "bangbros", "nsfw", "hentai", "sexy", "erwachsene", "xxx", "sex", "erotik", "nacktheit", "hardcore", "milf", "camgirl", "chaturbate", "glücksspiel", "casino", "poker", "wetten", "bet365", "roulette", "blackjack", "spielautomat", "gore", "gewalt", "blut", "tod", "töten", "mord", "hinrichtung", "folter", "drogen", "kokain", "heroin", "gras", "cannabis", "marihuana", "überdosis", "waffe", "pistole", "gewehr", "munition", "sprengstoff", "bombe", "terrorismus", "hass", "rassismus", "nazi", "vorherrschaft", "extremismus", "propaganda", "radikal", "betrug", "phishing", "malware", "virus", "hacker", "darkweb", "onion", "tor", "vagina", "penis", "klitoris", "anus", "hoden", "verkehr", "ejakulation", "fetisch", "bondage", "bdsm", "kink", "dominatrix", "voyeur", "eskorte", "prostituierte", "bordell", "prostitution", "menschenhandel", "inzest", "pädophil"],
    pt: ["porno", "xvideos", "pornhub", "redtube", "xnxx", "youporn", "brazzers", "bangbros", "nsfw", "hentai", "sexy", "adulto", "xxx", "sexo", "erotica", "nudez", "hardcore", "milf", "camgirl", "chaturbate", "jogo", "casino", "poker", "apostas", "bet365", "roleta", "blackjack", "cacaniquel", "gore", "violência", "sangue", "morte", "matar", "assassinato", "execução", "tortura", "drogas", "cocaína", "heroína", "erva", "cannabis", "marijuana", "overdose", "arma", "pistola", "rifle", "munição", "explosivo", "bomba", "terrorismo", "ódio", "racismo", "nazi", "supremacia", "extremismo", "propaganda", "radical", "golpe", "phishing", "malware", "virus", "hacker", "darkweb", "onion", "tor", "vagina", "pênis", "clitóris", "ânus", "testículo", "coito", "ejaculação", "fetiche", "bondage", "bdsm", "kink", "dominatrix", "voyeur", "escort", "prostituta", "bordel", "prostituição", "tráfico", "incesto", "pedófilo"],
    ru: ["порно", "xvideos", "pornhub", "redtube", "xnxx", "youporn", "brazzers", "bangbros", "nsfw", "hentai", "секс", "взрослые", "xxx", "эротика", "нагота", "hardcore", "milf", "camgirl", "chaturbate", "азартные игры", "казино", "покер", "ставки", "bet365", "рулетка", "блэкджек", "игровой автомат", "жестокость", "насилие", "кровь", "смерть", "убийство", "казнь", "пытки", "наркотики", "кокаин", "героин", "травка", "каннабис", "марихуана", "передозировка", "оружие", "пистолет", "винтовка", "боеприпасы", "взрывчатка", "бомба", "терроризм", "ненависть", "расизм", "нацист", "превосходство", "экстремизм", "пропаганда", "радикал", "мошенничество", "фишинг", "вредоносное по", "вирус", "хакер", "darkweb", "onion", "tor", "влагалище", "пенис", "клитор", "анус", "яичко", "соитие", "эякуляция", "фетиш", "бондаж", "bdsm", "кинк", "доминатрикс", "вуайерист", "эскорт", "проститутка", "бордель", "проституция", "трафик", "инцест", "педофил"],
    ja: ["ポルノ", "xvideos", "pornhub", "redtube", "xnxx", "youporn", "brazzers", "bangbros", "nsfw", "hentai", "セクシー", "アダルト", "xxx", "セックス", "エロ", "裸", "ハードコア", "熟女", "チャットレディ", "チャットレディ", "ギャンブル", "カジノ", "ポーカー", "賭け", "bet365", "ルーレット", "ブラックジャック", "スロットマシーン", "ゴア", "暴力", "血", "死", "殺害", "殺人", "処刑", "拷問", "薬物", "コカイン", "ヘロイン", "大麻", "マリファナ", "過剰摂取", "武器", "銃", "拳銃", "ライフル", "弾薬", "爆発物", "爆弾", "テロ", "ヘイト", "人種差別", "ナチス", "至上主義", "過激主義", "宣伝", "過激派", "詐欺", "フィッシング", "マルウェア", "ウイルス", "ハッカー", "ダークウェブ", "ドノア", "トーア", "膣", "陰茎", "核", "肛門", "精巣", "性交", "射精", "フェティッシュ", "緊縛", "bdsm", "キンク", "ドミナトリックス", "のぞき", "エスコート", "娼婦", "置屋", "売春", "人身売買", "近親相姦", "小児性愛"],
    zh: ["色情", "xvideos", "pornhub", "redtube", "xnxx", "youporn", "brazzers", "bangbros", "nsfw", "hentai", "性感", "成人", "xxx", "性爱", "色情片", "裸体", "硬核", "熟女", "视频女郎", "真人视频", "赌博", "赌场", "扑克", "投注", "bet365", "轮盘", "黑杰克", "老虎机", "血腥", "暴力", "血液", "死亡", "杀戮", "谋杀", "处决", "折磨", "毒品", "可卡因", "海洛因", "大麻", "过量", "武器", "枪支", "手枪", "步枪", "弹药", "爆炸物", "炸弹", "恐怖主义", "仇恨", "种族主义", "纳粹", "至上主义", "极端主义", "宣传", "激进", "诈骗", "网络钓鱼", "恶意软件", "病毒", "黑客", "暗网", "洋葱路由", "阴道", "阴茎", "阴蒂", "肛门", "睾丸", "性交", "射精", "恋物", "捆绑", "bdsm", "癖好", "女施虐者", "偷窥", "伴游", "妓女", "妓院", "卖淫", "人口贩卖", "乱伦", "恋童癖"],
    ar: ["إباحية", "سكس", "بورن", "عراة", "مثير", "بالغين", "جنس", "قمار", "كازينو", "بوكر", "رهان", "مخدرات", "كوكايين", "هيروين", "حشيش", "سلاح", "مسدس", "بندقية", "متفجرات", "قنبلة", "إرهاب", "عنف", "قتل", "دم", "موت", "تعذيب", "كراهية", "عنصرية", "نازية", "تطرف", "احتيال", "فيروس", "هاكر"]
};

const SENIOR_SAFETY_KEYWORDS = {
    en: ["lottery winner", "tech support", "gift card", "wire transfer", "security alert", "claim prize", "unusual activity", "limited time offer", "congratulations", "verification required", "account suspended"],
    it: ["vincitore lotteria", "supporto tecnico", "carta regalo", "bonifico bancario", "avviso sicurezza", "ritira premio", "attività insolita", "offerta limitata", "congratulazioni", "verifica richiesta", "account sospeso"]
};

async function loadSafetyPack(lang) {
    if (!(await checkSecurity())) return;

    const packName = lang === 'en' ? 'Anti-Scam (English)' : 'Anti-Frode (Italiano)';
    if (!confirm(`Add the ${packName} safety pack to your block list? This helps prevent common online scams.`)) {
        return;
    }

    const words = SENIOR_SAFETY_KEYWORDS[lang];
    if (!words) return;

    stopWords = [...new Set([...stopWords, ...words])];
    alert(i18nCustom.t("alert_pack_loaded", [(lang === 'en' ? 'English' : 'Italian')]));

    await chrome.storage.local.set({ stopWords });
    renderStopWords();
}

function setupParentalUI() {
    console.log("[Parental] Initializing UI...");
    renderStopWords();
    const addBtn = document.getElementById('addStopWordBtn');
    const input = document.getElementById('stopWordInput');
    const loadPresetsBtn = document.getElementById('loadPresetsBtn');
    const presetLangSelect = document.getElementById('presetLanguage');

    // Safety Preset Buttons
    document.querySelectorAll('.safety-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const lang = btn.getAttribute('data-pack');
            loadSafetyPack(lang);
        });
    });

    if (addBtn && input) {
        addBtn.addEventListener('click', async () => {
            if (!(await checkSecurity())) return;

            const word = input.value.trim().toLowerCase();
            if (word && !stopWords.includes(word)) {
                stopWords.push(word);
                await chrome.storage.local.set({ stopWords });
                input.value = '';
                renderStopWords();
            }
        });
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addBtn.click();
        });
    }

    if (loadPresetsBtn && presetLangSelect) {
        console.log("[Parental] Attaching Load Presets listener");
        loadPresetsBtn.addEventListener('click', async () => {
            if (!(await checkSecurity())) return;
            const lang = presetLangSelect.value;
            console.log(`[Parental] Loading presets for: ${lang}`);
            const presets = PRESET_WORDS[lang];

            if (!presets) {
                console.error(`[Parental] No presets found for: ${lang}`);
                return;
            }

            let addedCount = 0;
            presets.forEach(word => {
                if (!stopWords.includes(word)) {
                    stopWords.push(word);
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                await chrome.storage.local.set({ stopWords });
                renderStopWords();
                alert(i18nCustom.t("alert_presets_loaded", [addedCount.toString(), lang.toUpperCase()]));
            } else {
                alert(i18nCustom.t("alert_all_presets_exist"));
            }
        });

    } else {
        console.warn("[Parental] Missing UI elements for presets:", { loadPresetsBtn, presetLangSelect });
    }

    const clearBtn = document.getElementById('clearStopWordsBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            if (!(await checkSecurity())) return;
            if (confirm(i18nCustom.t("confirm_clear_stopwords"))) {
                stopWords = [];
                await chrome.storage.local.set({ stopWords });
                renderStopWords();
            }
        });
    }
}

function renderStopWords() {
    const list = document.getElementById('stopWordsList');
    if (!list) return;
    list.innerHTML = '';

    stopWords.forEach(word => {
        const tag = document.createElement('div');
        tag.style.cssText = 'background: rgba(255,255,255,0.05); padding: 4px 12px; border-radius: 100px; border: 1px solid var(--border); display: flex; align-items: center; gap: 8px; font-size: 13px;';
        tag.innerHTML = `
            <span>${word}</span>
            <span class="remove-word" style="cursor: pointer; color: #ef4444; font-weight: 800;">×</span>
        `;
        tag.querySelector('.remove-word').addEventListener('click', async () => {
            if (!(await checkSecurity())) return;
            stopWords = stopWords.filter(w => w !== word);
            await chrome.storage.local.set({ stopWords });
            renderStopWords();
        });
        list.appendChild(tag);
    });
}

function setupSupportUI() {
    const form = document.getElementById('supportForm');
    const feedback = document.getElementById('supportFeedback');
    const submitBtn = document.getElementById('submitSupportBtn');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const type = document.getElementById('supportType').value;
        const email = document.getElementById('supportEmail').value.trim();
        const message = document.getElementById('supportMessage').value.trim();

        if (!message) return;

        // Fully local: open the user's mail app with the message, nothing goes through a server.
        const subject = `Senior SafeSurf: ${type}`;
        const body = `${message}\n\nReply to: ${email || 'not provided'}\nVersion: ${chrome.runtime.getManifest().version}`;
        window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        feedback.classList.remove('hidden');
        feedback.style.background = 'rgba(74, 222, 128, 0.1)';
        feedback.style.color = '#4ade80';
        feedback.style.border = '1px solid rgba(74, 222, 128, 0.2)';
        feedback.textContent = i18nCustom.t("support_mail_opened");
    });
}

const SENIOR_PRESETS = {
    global: [
        { name: "AARP", url: "https://www.aarp.org" },
        { name: "Mayo Clinic", url: "https://www.mayoclinic.org" },
        { name: "BBC News", url: "https://www.bbc.com/news" },
        { name: "Chess.com", url: "https://www.chess.com" },
        { name: "Weather.com", url: "https://weather.com" },
        { name: "Social Security", url: "https://www.ssa.gov" }
    ],
    italian: [
        { name: "RAI News", url: "https://www.rainews.it" },
        { name: "Min. Salute", url: "https://www.salute.gov.it" },
        { name: "INPS", url: "https://www.inps.it" },
        { name: "Enigmistica", url: "https://www.enigmisticaonline.it" },
        { name: "Corriere News", url: "https://www.corriere.it" },
        { name: "Meteo.it", url: "https://www.meteo.it" }
    ]
};

async function loadPresetPack(packType) {
    if (!(await checkSecurity())) return;

    if (!confirm(i18nCustom.t("confirm_add_presets"))) {
        return;
    }

    const sites = SENIOR_PRESETS[packType];
    if (!sites) return;

    const res = await chrome.storage.local.get(['speedDialer']);
    let dialer = res.speedDialer || [];
    if (!Array.isArray(dialer)) dialer = [];

    for (let i = 0; i < sites.length; i++) {
        dialer[i] = sites[i];
    }

    await chrome.storage.local.set({ speedDialer: dialer });
    renderDialerList();
    alert(i18nCustom.t("alert_pack_loaded", [(packType === 'global' ? 'Global' : 'Italian')]));
}

async function setupDialerUI() {
    renderDialerList();
    const addBtn = document.getElementById('addDialBtn');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            if (!(await checkSecurity())) return;
            const name = document.getElementById('dialName').value.trim();
            const url = document.getElementById('dialUrl').value.trim();
            if (!name || !url) return;

            const res = await chrome.storage.local.get(['speedDialer']);
            let dialer = res.speedDialer || [];
            if (!Array.isArray(dialer)) dialer = [];

            // Simple index find (first empty slot)
            let index = dialer.findIndex(item => item === null || item === undefined);
            if (index === -1) index = dialer.length;

            // Clean URL
            const cleanUrl = url.includes('://') ? url : 'https://' + url;

            dialer[index] = { name, url: cleanUrl };
            await chrome.storage.local.set({ speedDialer: dialer });

            document.getElementById('dialName').value = '';
            document.getElementById('dialUrl').value = '';
            renderDialerList();
        });
    }

    // Preset Buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pack = btn.getAttribute('data-pack');
            loadPresetPack(pack);
        });
    });
}

async function renderDialerList() {
    const list = document.getElementById('dialerList');
    if (!list) return;

    const res = await chrome.storage.local.get(['speedDialer']);
    let dialer = res.speedDialer || [];

    // Filter out empty/null slots for the management list
    const activeItems = dialer.filter(item => item !== null && item !== undefined);

    list.innerHTML = '';

    if (activeItems.length === 0) {
        list.innerHTML = `<div style="color: #64748b; text-align: center; padding: 20px;">${i18nCustom.t("no_dial_sites")}</div>`;
        return;
    }

    // Keep track of original indices for deletion
    dialer.forEach((item, index) => {
        if (!item) return; // Skip empty slots

        const div = document.createElement('div');
        div.className = 'options-item';
        div.innerHTML = `
            <div class="info">
                <span class="name">${item.name}</span>
                <span class="description">${item.url}</span>
            </div>
            <div class="actions">
                <button class="btn-action btn-delete" data-index="${index}">Remove</button>
            </div>
        `;
        div.querySelector('.btn-delete').onclick = async () => {
            if (!(await checkSecurity())) return;
            // Remove specific slot
            dialer[index] = null;
            await chrome.storage.local.set({ speedDialer: dialer });
            renderDialerList();
        };
        list.appendChild(div);
    });
}
