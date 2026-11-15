/**
 * Senior SafeSurf i18n Helper
 * Manually handles language overrides for in-app switching
 */
const i18nCustom = {
    messages: {},
    currentLang: 'en',

    async init() {
        const result = await chrome.storage.local.get(['appLanguage']);
        this.currentLang = result.appLanguage || 'en';
        await this.load(this.currentLang);
    },

    async load(lang) {
        this.currentLang = lang;
        try {
            const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
            const response = await fetch(url);
            this.messages = await response.json();
        } catch (e) {
            console.error("i18nCustom: Failed to load", lang, e);
            this.messages = {};
        }
    },

    t(key, args) {
        let msgObj = this.messages[key];
        let message = msgObj ? msgObj.message : chrome.i18n.getMessage(key);

        if (!message) return key;

        // Handle Chrome-style placeholders $1, $2, etc.
        if (args) {
            if (!Array.isArray(args)) args = [args];

            // First, handle named placeholders defined in messages.json
            if (msgObj && msgObj.placeholders) {
                for (let pName in msgObj.placeholders) {
                    let pObj = msgObj.placeholders[pName];
                    let content = pObj.content; // Usually "$1", "$2", etc.
                    let index = parseInt(content.replace('$', '')) - 1;
                    let replacement = args[index] !== undefined ? args[index] : content;
                    message = message.replace(`$${pName.toUpperCase()}$`, replacement);
                }
            }

            // Fallback: handle direct $1, $2 replacement if no explicit placeholder map 
            // or if they are used directly in the string
            args.forEach((val, i) => {
                message = message.replace(`$${i + 1}`, val);
            });
        }

        return message;
    }
};

async function applyTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = i18nCustom.t(key);
        if (translation && translation !== key) {
            if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'placeholder' || el.hasAttribute('placeholder'))) {
                el.placeholder = translation;
            } else if (el.tagName === 'TEXTAREA') {
                el.placeholder = translation;
            } else {
                el.textContent = translation;
            }
        }
    });
}

// Initial load
document.addEventListener('DOMContentLoaded', async () => {
    await i18nCustom.init();
    applyTranslations();
});
