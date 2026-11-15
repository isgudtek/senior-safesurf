(async function () {
    // Early return if not enabled to ensure zero performance flow
    const settings = await chrome.storage.local.get(['enableContentFilter', 'stopWords', 'masterEnabled', 'parentalEnabled']);
    const isMasterEnabled = settings.masterEnabled !== false;
    const isParentalEnabled = settings.parentalEnabled !== false;

    if (!isMasterEnabled || !isParentalEnabled || !settings.enableContentFilter || !settings.stopWords || settings.stopWords.length === 0) {
        return;
    }

    const stopWords = settings.stopWords;
    let isBlocked = false;

    function checkContent() {
        if (isBlocked) return;

        const text = document.body.innerText.toLowerCase();
        for (const word of stopWords) {
            if (text.includes(word)) {
                isBlocked = true;
                console.log(`[Senior SafeSurf] Content match found: ${word}. Redirection triggered.`);

                // Redirect to blocked page with specific reason
                const blockedUrl = chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(window.location.href)}&reason=content&word=${encodeURIComponent(word)}`);
                window.location.href = blockedUrl;
                return true;
            }
        }
        return false;
    }

    // Start observing as soon as body is available
    const observeBody = () => {
        if (!document.body) {
            setTimeout(observeBody, 50);
            return;
        }

        // Initial check
        checkContent();

        // Observe for dynamic content
        const observer = new MutationObserver(() => {
            if (checkContent()) {
                observer.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    };

    observeBody();
})();
