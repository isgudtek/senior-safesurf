// Builds the small page snapshot that is sent to the AI engine (classic script).
// Only this snapshot ever leaves the page: never the full text, never the query string.
(function (root) {
    const MAX_CHARS = 3000;
    const AROUND = 300;

    const clip = (s, n) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

    function hostOf(url) {
        try { return new URL(url, location.href).hostname; } catch { return ''; }
    }

    function build({ text, match, trigger, doc = document, loc = location }) {
        const body = text != null ? text : (doc.body ? doc.body.innerText : '');
        let excerpt;
        if (match) {
            const start = Math.max(0, match.index - AROUND);
            excerpt = body.slice(start, match.index + match.word.length + AROUND);
        } else {
            excerpt = body.slice(0, 1500);
        }

        const headings = Array.from(doc.querySelectorAll('h1, h2')).slice(0, 5).map((h) => clip(h.textContent, 120));
        const meta = doc.querySelector('meta[name="description"]');
        const pageHost = loc.hostname;
        const formHosts = Array.from(new Set(
            Array.from(doc.querySelectorAll('form[action]'))
                .map((f) => hostOf(f.getAttribute('action')))
                .filter((h) => h && h !== pageHost)
        )).slice(0, 5);

        const snap = {
            trigger,
            host: pageHost,
            path: loc.pathname.slice(0, 120), // no query string, no fragment
            title: clip(doc.title, 200),
            description: clip(meta && meta.getAttribute('content'), 300),
            headings,
            word: match ? match.word : undefined,
            excerpt: clip(excerpt, 2 * AROUND + 200),
            flags: {
                passwordField: !!doc.querySelector('input[type="password"]'),
                cardField: !!doc.querySelector('input[autocomplete^="cc-"], input[name*="card" i], input[id*="card" i]'),
                formPostsElsewhere: formHosts
            }
        };
        // Hard cap on the serialized size.
        while (JSON.stringify(snap).length > MAX_CHARS && snap.excerpt.length > 100) {
            snap.excerpt = snap.excerpt.slice(0, Math.floor(snap.excerpt.length * 0.8));
        }
        return snap;
    }

    root.SafeSurfSnapshot = { build, MAX_CHARS };
    if (typeof module !== 'undefined') module.exports = root.SafeSurfSnapshot;
})(typeof globalThis !== 'undefined' ? globalThis : this);
