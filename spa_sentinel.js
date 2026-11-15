(async function () {
    // This sentinel detects internal SPA navigations (like YouTube clicks)
    // and forces a hard reload if the new URL is in the blacklist.
    // The hard reload will then be caught by the main background blocker.

    const result = await chrome.storage.local.get(['blacklist', 'masterEnabled']);
    let masterOn = result.masterEnabled !== false;
    let blacklist = result.blacklist || [];

    // Keep rules current: v1.3 read them once and missed edits made while the tab was open.
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.blacklist) blacklist = changes.blacklist.newValue || [];
        if (changes.masterEnabled) masterOn = changes.masterEnabled.newValue !== false;
    });

    let lastUrl = location.href;

    function checkSurgicalMatch() {
        if (!masterOn || blacklist.length === 0) return;
        const currentUrl = location.href;
        if (currentUrl === lastUrl) return;

        const urlObj = new URL(currentUrl);
        const domain = urlObj.hostname.replace(/^www\./, '').toLowerCase();
        const pathAndQuery = (urlObj.pathname + urlObj.search + urlObj.hash).toLowerCase();
        const fullPath = (domain + pathAndQuery).replace(/\/$/, '');

        for (const entry of blacklist) {
            const cleanEntry = entry.toLowerCase().replace(/\/$/, '');

            // 1. Path/Domain Match (contains . or /)
            if (cleanEntry.includes('.') || cleanEntry.includes('/')) {
                // Check if current URL starts with the blacklisted entry
                if (fullPath.startsWith(cleanEntry)) {
                    // Ensure it's a complete match or followed by a delimiter (/, ?, #, &)
                    const nextChar = fullPath[cleanEntry.length];
                    if (!nextChar || '/?#&'.includes(nextChar)) {
                        console.log("[Senior SafeSurf] SPA Sentinel Match: " + cleanEntry);
                        location.reload();
                        return;
                    }
                }
            } else {
                // 2. Keyword Match (simple word)
                if (domain.includes(cleanEntry)) {
                    console.log("[Senior SafeSurf] SPA Sentinel Keyword Match: " + cleanEntry);
                    location.reload();
                    return;
                }
            }
        }

        lastUrl = currentUrl;
    }

    // Faster polling (500ms) for better UX on high-speed SPAs
    setInterval(checkSurgicalMatch, 500);
})();
