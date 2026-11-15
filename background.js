// Constants
const LICENSE_API_URL = 'https://gudtek.lol/chrome/api.php';

// Initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
    const result = await chrome.storage.local.get(['blacklist']);
    if (!result.blacklist) {
        await chrome.storage.local.set({ blacklist: [] });
    }
    await updateBlockingRules();

    if (details.reason === 'install') {
        chrome.tabs.create({ url: 'welcome.html' });
    }

    // Schedule license check heartbeat (Daily)
    await chrome.alarms.create('licenseCheck', {
        periodInMinutes: 1440 // 24 hours
    });

    // Run once on install/update
    performSilentLicenseCheck();
});

// Update rules on startup
chrome.runtime.onStartup.addListener(() => {
    updateBlockingRules();
    performSilentLicenseCheck();
});

// Alarm Listener
if (chrome.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'licenseCheck') {
            performSilentLicenseCheck();
        }
    });
}

// Listen for messages from popup and blocked page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === "updateRules") {
        updateBlockingRules().then(() => {
            sendResponse({ status: "success" });
        });
        return true;
    }

    if (message.command === "openOptions") {
        chrome.runtime.openOptionsPage();
        return true;
    }

    if (message.command === "startBypass") {
        handleStartBypass(message.url, sender.tab.id)
            .then(() => sendResponse({ status: "success" }))
            .catch((err) => {
                console.error("Bypass start error:", err);
                sendResponse({ status: "error", message: err.message });
            });
        return true;
    }

    if (message.command === "checkBypass") {
        const domain = message.domain;
        const tabId = sender.tab.id;

        // Find if this tab has an active bypass for this domain or a parent domain
        let activeBypassData = { active: false };
        for (const [key, expirationTime] of Object.entries(activeBypasses)) {
            const [bTabId, bDomain] = key.split('_');
            if (parseInt(bTabId) === tabId && (domain === bDomain || domain.endsWith('.' + bDomain))) {
                if (expirationTime > Date.now()) {
                    activeBypassData = { active: true, timeLeft: Math.ceil((expirationTime - Date.now()) / 1000) };
                    break;
                }
            }
        }

        sendResponse(activeBypassData);
        return true;
    }
});

let activeBypasses = {}; // "tabId_domain" -> expirationTime

async function handleStartBypass(urlStr, tabId) {
    let domain = urlStr;
    try {
        const url = new URL(urlStr.includes('://') ? urlStr : 'http://' + urlStr);
        domain = url.hostname || urlStr;
    } catch (e) {
        domain = urlStr;
    }

    // Unique rule ID per tab (to avoid conflicts)
    const bypassRuleId = 10000 + tabId;
    const duration = 10000; // 10 seconds for testing

    console.log(`Starting ${duration / 1000}s bypass for tab ${tabId} on domain: ${domain}`);

    // Add high priority allow rule SPECIFIC to this tab using session rules
    await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [{
            id: bypassRuleId,
            priority: 100,
            action: { type: "allow" },
            condition: {
                urlFilter: `||${domain}^`,
                resourceTypes: ["main_frame"],
                tabIds: [tabId] // Supported in session rules
            }
        }],
        removeRuleIds: [bypassRuleId]
    });

    const bypassKey = `${tabId}_${domain}`;
    const expirationTime = Date.now() + duration;
    activeBypasses[bypassKey] = expirationTime;

    // Set timer to remove the bypass and FORCE reload
    setTimeout(async () => {
        await chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [bypassRuleId]
        });
        delete activeBypasses[bypassKey];

        // Force reload the tab to trigger the block page
        try {
            chrome.tabs.reload(tabId);
        } catch (e) {
            console.log("Tab already closed, no reload needed.");
        }
    }, duration);
}

let isUpdating = false;
let needsUpdate = false;

// Update declarativeNetRequest rules based on blacklist
async function updateBlockingRules() {
    if (isUpdating) {
        needsUpdate = true;
        console.log("Update in progress, queuing next update...");
        return;
    }

    isUpdating = true;
    needsUpdate = false;
    console.log("Starting updateBlockingRules...");
    try {
        const result = await chrome.storage.local.get(['blacklist', 'isUnlocked', 'masterEnabled', 'blockingEnabled']);
        const blacklist = result.blacklist || [];
        const isMasterEnabled = result.masterEnabled !== false;
        const isBlockingEnabled = result.blockingEnabled !== false;

        // Clear existing rules
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const existingRuleIds = existingRules.map(rule => rule.id);
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existingRuleIds,
            addRules: []
        });

        if (!isMasterEnabled || !isBlockingEnabled) {
            console.log("[Senior SafeSurf] Protection OFF (Master or Blocking toggle). Rules purged.");
            return;
        }

        console.log("Blacklist:", blacklist);

        // Get blocked page URL
        const blockedPageUrl = chrome.runtime.getURL('blocked.html');

        // Build rules
        const rules = blacklist.map((entry, index) => {
            const ruleId = index + 1;

            // NEW RULE TYPES:
            // 1. Keyword Block (no dots, no slashes): example -> blocks example.com, example.net, etc.
            // 2. Domain Block (has dots, no slashes): example.com -> blocks example.com and subdomains.
            // 3. Path Block (has slashes): example.com/blog -> blocks specific path.

            if (!entry.includes('.') && !entry.includes('/')) {
                // Keyword "Any TLD" block
                const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const escaped = escapeRegex(entry);

                return {
                    id: ruleId,
                    priority: 10,
                    action: {
                        type: "redirect",
                        redirect: {
                            regexSubstitution: chrome.runtime.getURL('blocked.html') + '?url=\\1'
                        }
                    },
                    condition: {
                        // Matches: http(s)://(optional.subdomain.)keyword.any_tld/optional_paths
                        regexFilter: `^(https?://(?:[^/]*\\.)?${escaped}\\.[a-z0-9]+.*)`,
                        resourceTypes: ["main_frame", "sub_frame"]
                    }
                };
            } else if (!entry.includes('/')) {
                // Domain block
                const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const escaped = escapeRegex(entry);
                return {
                    id: ruleId,
                    priority: 10,
                    action: {
                        type: "redirect",
                        redirect: {
                            regexSubstitution: chrome.runtime.getURL('blocked.html') + '?url=\\1'
                        }
                    },
                    condition: {
                        // Matches: http(s)://(optional.subdomain.)domain.com/optional_paths
                        regexFilter: `^(https?://(?:[^/]*\\.)?${escaped}.*)`,
                        resourceTypes: ["main_frame", "sub_frame"]
                    }
                };
            } else {
                // Specific path block
                const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const escaped = escapeRegex(entry);

                return {
                    id: ruleId,
                    priority: 10,
                    action: {
                        type: "redirect",
                        redirect: {
                            regexSubstitution: chrome.runtime.getURL('blocked.html') + '?url=\\1'
                        }
                    },
                    condition: {
                        regexFilter: `^(https?://(?:[^/]+\\.)?${escaped}.*)`,
                        resourceTypes: ["main_frame", "sub_frame"]
                    }
                };
            }
        });

        console.log("Updating DNR rules...", rules.length);
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existingRuleIds,
            addRules: rules
        });

        console.log("DNR update complete.");
    } catch (err) {
        console.error("DNR update failed:", err);
    } finally {
        isUpdating = false;
        if (needsUpdate) {
            updateBlockingRules();
        }
    }
}

async function performSilentLicenseCheck() {
    const result = await chrome.storage.local.get(['isPro', 'licenseKey', 'blacklist']);
    if (!result.isPro || !result.licenseKey) return;

    console.log("[SurgicalFocus] performing background license verification...");

    try {
        const response = await fetch(`${LICENSE_API_URL}?action=validate&key=${result.licenseKey}`);
        const data = await response.json();

        if (!data.success || !data.valid) {
            console.log("[SurgicalFocus] License expired or invalid. Downgrading to FREE.");

            let newBlacklist = result.blacklist || [];
            if (newBlacklist.length > 3) {
                newBlacklist = newBlacklist.slice(0, 3);
            }

            await chrome.storage.local.set({
                isPro: false,
                licenseKey: '',
                blacklist: newBlacklist
            });

            await updateBlockingRules();
        } else {
            console.log("[SurgicalFocus] License verified. Expiration:", data.expires_at || 'Never');
        }
    } catch (e) {
        console.error("[SurgicalFocus] Background license check failed (network error):", e);
    }
}
