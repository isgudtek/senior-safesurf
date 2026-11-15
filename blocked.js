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
        msg.innerHTML = `This page was blocked by Senior SafeSurf because it contains protected content. Take a deep breath.`;
    }
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = "Protected Content.";

    // Debug: show keyword in footer
    const debugEl = document.getElementById('debugKeyword');
    if (debugEl && word) {
        debugEl.textContent = `[${word}]`;
    }
}

// Load custom background & attribution
chrome.storage.local.get(['customBackground', 'bgAuthorName', 'bgAuthorUrl', 'isPro'], async (result) => {
    const bgContainer = document.getElementById('bgContainer');
    const authorAttribution = document.getElementById('authorAttribution');
    const authorLink = document.getElementById('authorLink');
    const isProUser = result.isPro === true;

    if (!bgContainer) return;

    // Use 'toys' background for parental blocks
    // For others: if FREE, use fixed fallback. If PRO, use their choice (or random:abstract fallback).
    const fixedFallback = 'https://images.pexels.com/photos/310452/pexels-photo-310452.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2';

    let bgUrl = result.customBackground || 'random:abstract';
    if (isContentBlock) {
        bgUrl = 'random:toys';
    }

    // Force fixed fallback for FREE users if they have random selected or no selection
    if (!isProUser) {
        if (!result.customBackground || bgUrl.startsWith('random:')) {
            bgUrl = fixedFallback;
        }
    }

    let authorName = result.bgAuthorName;
    let authorUrl = result.bgAuthorUrl;

    // Handle Random Category (PRO Only)
    if (bgUrl.startsWith('random:')) {
        const category = bgUrl.split(':')[1];
        const PEXELS_API_KEY = 'IQkbu7hsbNHooEjFvGwQUm0Gqmdcf2Pz30HPsTD2vu5AcwJEkIoOgS6J';
        try {
            const response = await fetch(`https://api.pexels.com/v1/search?query=${category}&per_page=40&page=1&orientation=landscape`, {
                headers: { 'Authorization': PEXELS_API_KEY }
            });
            const data = await response.json();
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
    const masterPassword = result.password;

    if (!masterPassword) {
        alert('Internal error: No master password set.');
        return;
    }

    const pass = prompt('Deep Focus Override: Enter Master Password');
    if (pass === masterPassword) {
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
