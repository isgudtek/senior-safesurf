// Keyword matching shared by the content scripts (classic script, no modules).
// v1.3 used text.includes(word), so "tor" matched "history" and "gun" matched "begun".
// Words in space-separated scripts now need a word boundary; CJK words still match anywhere.
(function (root) {
    const NO_SPACES = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/; // kana, Han, Hangul
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    function compile(words) {
        return words
            .map((w) => String(w || '').trim().toLowerCase())
            .filter(Boolean)
            .map((word) => ({
                word,
                re: NO_SPACES.test(word)
                    ? new RegExp(escape(word), 'u')
                    : new RegExp(`(?<![\\p{L}\\p{N}])${escape(word).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu')
            }));
    }

    // Returns { word, index } for the first match, or null. `skip` holds words already cleared on this page.
    function findMatch(text, compiled, skip) {
        for (const { word, re } of compiled) {
            if (skip && skip.has(word)) continue;
            const m = re.exec(text);
            if (m) return { word, index: m.index };
        }
        return null;
    }

    root.SafeSurfKeywords = { compile, findMatch };
    if (typeof module !== 'undefined') module.exports = root.SafeSurfKeywords;
})(typeof globalThis !== 'undefined' ? globalThis : this);
