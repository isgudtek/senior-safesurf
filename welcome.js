document.addEventListener('DOMContentLoaded', async () => {
    let currentSlide = 1;
    const totalSlides = document.querySelectorAll('.slide').length;

    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');

    function updateSlides() {
        slides.forEach((slide, index) => {
            slide.classList.remove('active');
            if (index === currentSlide - 1) {
                slide.classList.add('active');
            }
        });

        dots.forEach((dot, index) => {
            dot.classList.remove('active');
            if (index === currentSlide - 1) {
                dot.classList.add('active');
            }
        });

        // Button visibility
        if (currentSlide === 1) {
            prevBtn.style.visibility = 'hidden';
        } else {
            prevBtn.style.visibility = 'visible';
        }

        if (currentSlide === totalSlides) {
            nextBtn.style.display = 'none';
        } else {
            nextBtn.style.display = 'flex';
        }
    }

    nextBtn.addEventListener('click', () => {
        if (currentSlide < totalSlides) {
            currentSlide++;
            updateSlides();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentSlide > 1) {
            currentSlide--;
            updateSlides();
        }
    });

    setupAiSlide();

    // Load random abstract background
    const bgContainer = document.getElementById('bgContainer');
    const authorAttribution = document.getElementById('authorAttribution');
    const authorLink = document.getElementById('authorLink');

    if (bgContainer) {
        try {
            const data = await chrome.runtime.sendMessage({ command: 'pexelsSearch', query: 'abstract', page: 1, perPage: 40 });
            if (data.photos && data.photos.length > 0) {
                const randomIndex = Math.floor(Math.random() * data.photos.length);
                const photo = data.photos[randomIndex];
                bgContainer.style.backgroundImage = `url(${photo.src.large2x})`;

                if (authorAttribution && authorLink) {
                    authorLink.textContent = photo.photographer;
                    authorLink.href = photo.photographer_url;
                }
            }
        } catch (e) {
            console.error('Error loading welcome background:', e);
        }
    }

    // Initialize
    updateSlides();
});

// ---------- Slide 5: on-device AI + cloud consent ----------
const NANO_OPTS = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }]
};

async function nanoAvailability() {
    if (typeof LanguageModel === 'undefined') return 'missing';
    try { return await LanguageModel.availability(NANO_OPTS); } catch { return 'unavailable'; }
}

function describeNano(state) {
    const title = document.getElementById('wNanoTitle');
    const desc = document.getElementById('wNanoDesc');
    if (state === 'available') {
        title.textContent = '✅ On-device AI is ready on this computer';
        desc.textContent = 'Checks run locally, work offline and cost nothing.';
    } else if (state === 'downloadable' || state === 'downloading') {
        title.textContent = '⬇️ On-device AI needs a one-time download';
        desc.textContent = 'About 4 GB on an unmetered connection (Chrome needs 22 GB of free disk space). It starts when you press "Start protecting". Until it finishes, your keyword list and cloud checks (if allowed) protect you.';
    } else if (state === 'missing') {
        title.textContent = '❌ On-device AI is not available in this Chrome';
        desc.textContent = 'It needs desktop Chrome 138 or newer. Update Chrome, or allow cloud checks below. Your keyword list keeps working either way.';
    } else {
        title.textContent = '❌ This computer cannot run on-device AI';
        desc.textContent = 'It needs Windows 10/11, macOS 13+, Linux or a Chromebook Plus, 22 GB of free disk space, and a GPU with more than 4 GB of memory or 16 GB of RAM. Allow cloud checks below to get AI protection anyway. Your keyword list keeps working either way.';
    }
}

async function setupAiSlide() {
    const startBtn = document.getElementById('startBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const consent = document.getElementById('wConsent');
    const msg = document.getElementById('wStartMsg');
    if (!startBtn) return;

    let state = await nanoAvailability();
    describeNano(state);
    const { aiCloudConsent } = await chrome.storage.local.get('aiCloudConsent');
    consent.checked = aiCloudConsent === true;
    // Without on-device AI the cloud is the only AI option, so suggest it (still the user's choice).
    if (aiCloudConsent === undefined && (state === 'unavailable' || state === 'missing')) consent.checked = true;

    settingsBtn.addEventListener('click', () => {
        window.location.href = chrome.runtime.getURL('options.html#instructions');
    });

    startBtn.addEventListener('click', async () => {
        await chrome.storage.local.set({ aiMode: 'hybrid', aiCloudConsent: consent.checked });
        startBtn.style.display = 'none';
        settingsBtn.style.display = 'flex';

        state = await nanoAvailability();
        if (state === 'downloadable' || state === 'downloading') {
            // This click is the user gesture Chrome requires to start the download.
            msg.textContent = 'Downloading the on-device AI. You can keep this tab open or continue; protection is already on.';
            document.getElementById('wNanoProgress').style.display = 'block';
            const bar = document.getElementById('wNanoBar');
            try {
                const session = await LanguageModel.create({
                    ...NANO_OPTS,
                    monitor(m) { m.addEventListener('downloadprogress', (e) => { bar.style.width = `${Math.round(e.loaded * 100)}%`; }); }
                });
                session.destroy();
                bar.style.width = '100%';
                describeNano('available');
                msg.textContent = 'All set. Smart protection is on.';
            } catch (e) {
                msg.textContent = `The download could not start (${e.message || e}). You can retry from Settings > AI Protection.`;
            }
        } else {
            msg.textContent = state === 'available'
                ? 'All set. Smart protection is on.'
                : (consent.checked ? 'Smart protection is on, using cloud checks.' : 'Keyword protection is on. Allow cloud checks anytime for AI protection.');
        }
    });
}
