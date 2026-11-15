// Get blocked domain from URL params
const urlParams = new URLSearchParams(window.location.search);
const blockedUrl = urlParams.get('url') || 'unknown';

try {
    const url = new URL(blockedUrl);
    document.getElementById('blockedDomain').textContent = url.hostname;
} catch {
    document.getElementById('blockedDomain').textContent = blockedUrl;
}

// Handle content-based block message
const reason = urlParams.get('reason');
const word = urlParams.get('word');
const isContentBlock = reason === 'content';
const isTimerBlock = reason === 'timer';

if (isTimerBlock) {
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = "Time's up!";
    const msg = document.querySelector('.message');
    if (msg) msg.textContent = "Your scheduled focus time has ended. Take a moment to stretch!";

    const domainBox = document.querySelector('.domain-box');
    if (domainBox) domainBox.classList.add('hidden');

    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.classList.remove('hidden');
        backBtn.onclick = () => history.back();
    }

    const continueBtn = document.getElementById('continueBtn');
    if (continueBtn) continueBtn.classList.add('hidden');
} else if (isContentBlock) {
    const msg = document.querySelector('.message');
    if (msg) {
        msg.textContent = 'This page was blocked by Senior SafeSurf because it contains protected content. Take a deep breath.';
    }
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = "Protected Content.";
    showBlockReason();
}

// Explain the block in two honest steps:
//  1. "Blocked instantly: the page contains the blocked word X" (keyword match, no AI involved).
//  2. The AI review (?pid=): confirmed by Gemini Nano / the cloud with its reason, or "looks harmless"
//     and the page reopens. If the AI is off, unavailable or too slow, step 1 stays as the reason.
async function showBlockReason() {
    const CATEGORY = {
        adult: 'adult content', gambling: 'gambling', violence: 'graphic violence', drugs: 'illegal drugs',
        weapons: 'weapons', hate: 'hate or extremism', scam: 'a likely scam', phishing: 'a likely phishing page',
        malware: 'possible malware', other: 'unsafe content'
    };
    const WHO = {
        'on-device': { icon: '🔒', name: 'Gemini Nano', where: 'on this computer. Nothing was sent online' },
        cloud: { icon: '☁️', name: 'Gemini', where: 'in the cloud via Firebase' }
    };
    const box = document.getElementById('aiReason');
    const text = document.getElementById('aiReasonText');
    const engine = document.getElementById('aiEngine');
    if (!box || !text || !engine) return;
    box.classList.remove('hidden');

    const keywordLine = word
        ? `⚡ Blocked instantly: this page contains the blocked word "${word}".`
        : '⚡ Blocked instantly by your block list.';
    text.textContent = keywordLine;

    const pid = urlParams.get('pid');
    const vid = urlParams.get('vid');
    let verdict = null;
    if (pid) {
        engine.textContent = '🛡 Checking with AI…';
        const timeout = new Promise((r) => setTimeout(() => r(null), 25000));
        try {
            verdict = await Promise.race([chrome.runtime.sendMessage({ command: 'awaitVerdict', pid }), timeout]);
        } catch { verdict = null; }
    } else if (vid) {
        try { verdict = await chrome.runtime.sendMessage({ command: 'getVerdict', vid }); } catch { verdict = null; }
    }

    const who = verdict && WHO[verdict.engine];
    if (!verdict || !who) {
        // Keyword match mode, AI unavailable, or no answer in time: the keyword block stands.
        engine.textContent = 'Blocked by your keyword list.';
        return;
    }
    if (verdict.verdict === 'allow') {
        text.textContent = `✅ ${who.name}: this mention looks harmless. Opening the page…`;
        engine.textContent = `${who.icon} Checked by ${who.name} ${who.where}.`;
        let target = blockedUrl;
        if (!/^https?:\/\//.test(target)) return;
        setTimeout(() => window.location.replace(target), 1400);
        return;
    }
    const type = CATEGORY[verdict.category] ? `${CATEGORY[verdict.category]}. ` : '';
    text.textContent = `${keywordLine}\n${who.icon} Confirmed by ${who.name}: ${type}${verdict.reason || ''}`; // textContent only
    engine.textContent = `${who.icon} Checked by ${who.name} ${who.where}${verdict.cached ? ' (remembered from an earlier visit)' : ''}.`;
}

// Load custom background & attribution
chrome.storage.local.get(['customBackground', 'bgAuthorName', 'bgAuthorUrl'], async (result) => {
    const bgContainer = document.getElementById('bgContainer');
    const authorAttribution = document.getElementById('authorAttribution');
    const authorLink = document.getElementById('authorLink');

    if (!bgContainer) return;

    // Use 'toys' background for parental blocks, otherwise the user's choice (or random:abstract).
    const fixedFallback = 'https://images.pexels.com/photos/310452/pexels-photo-310452.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2';

    let bgUrl = result.customBackground || 'random:abstract';
    if (isContentBlock) {
        bgUrl = 'random:toys';
    }

    let authorName = result.bgAuthorName;
    let authorUrl = result.bgAuthorUrl;

    // Handle Random Category
    if (bgUrl.startsWith('random:')) {
        const category = bgUrl.split(':')[1];
        try {
            const data = await chrome.runtime.sendMessage({ command: 'pexelsSearch', query: category, page: 1, perPage: 40 });
            if (data.photos && data.photos.length > 0) {
                const randomIndex = Math.floor(Math.random() * data.photos.length);
                const photo = data.photos[randomIndex];
                bgUrl = photo.src.large2x;
                authorName = photo.photographer;
                authorUrl = photo.photographer_url;
            }
        } catch (e) {
            console.error("Error fetching random background:", e);
            // Fallback to fixed on error
            bgUrl = fixedFallback;
        }
    }

    bgContainer.style.backgroundImage = `url(${bgUrl})`;
    document.body.style.backgroundImage = 'none';

    if (authorName && authorUrl && authorAttribution && authorLink) {
        authorLink.textContent = authorName;
        authorLink.href = authorUrl;
        authorAttribution.classList.remove('hidden');
    }
});

const continueAnyway = async function () {
    const result = await chrome.storage.local.get(['password']);
    if (!result.password) {
        alert('Internal error: No master password set.');
        return;
    }

    const pass = prompt('Deep Focus Override: Enter Master Password');
    if (pass !== null && await SafeSurfSecurity.check(pass)) {
        chrome.runtime.sendMessage({
            command: "startBypass",
            url: blockedUrl
        }, (response) => {
            if (response && response.status === "success") {
                let finalUrl = blockedUrl;
                if (!finalUrl.includes('://')) {
                    finalUrl = 'https://' + finalUrl;
                }
                window.location.href = finalUrl;
            } else {
                alert('Connection failed. Please refresh.');
            }
        });
    } else if (pass !== null) {
        alert('Authentication failed.');
    }
}

// Add event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const continueBtn = document.getElementById('continueBtn');

    // Check if bypass is enabled
    const result = await chrome.storage.local.get(['enableBypass']);
    if (result.enableBypass !== true) {
        if (continueBtn) continueBtn.style.display = 'none';
    }

    if (continueBtn) {
        continueBtn.addEventListener('click', continueAnyway);

        // Add a small subtle behavior: the text changes slightly if hovered or after a delay
        setTimeout(() => {
            if (continueBtn.textContent === "Mindful Override") {
                // continueBtn.style.letterSpacing = "0.05em"; // Subliminal shift
            }
        }, 5000);
    }
});

// Create floating focus particles
const particlesContainer = document.getElementById('particles');
if (particlesContainer) {
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const size = Math.random() * 4 + 1;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (15 + Math.random() * 20) + 's';
        particle.style.opacity = Math.random() * 0.2;
        particlesContainer.appendChild(particle);
    }
}
