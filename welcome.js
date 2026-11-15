document.addEventListener('DOMContentLoaded', async () => {
    let currentSlide = 1;
    const totalSlides = 5;

    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const freeBtn = document.getElementById('freeBtn');
    const proBtn = document.getElementById('proBtn');

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

    // Final Action Buttons
    if (freeBtn) {
        freeBtn.addEventListener('click', () => {
            window.location.href = chrome.runtime.getURL('options.html#domains');
        });
    }

    if (proBtn) {
        proBtn.addEventListener('click', () => {
            window.location.href = chrome.runtime.getURL('options.html#general');
        });
    }

    // Load random abstract background
    const PEXELS_API_KEY = 'IQkbu7hsbNHooEjFvGwQUm0Gqmdcf2Pz30HPsTD2vu5AcwJEkIoOgS6J';
    const bgContainer = document.getElementById('bgContainer');
    const authorAttribution = document.getElementById('authorAttribution');
    const authorLink = document.getElementById('authorLink');

    if (bgContainer) {
        try {
            const response = await fetch('https://api.pexels.com/v1/search?query=abstract&per_page=40&page=1&orientation=landscape', {
                headers: { 'Authorization': PEXELS_API_KEY }
            });
            const data = await response.json();
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
