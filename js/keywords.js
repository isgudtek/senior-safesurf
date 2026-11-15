// Keyword matching shared by the content scripts (classic script, no modules).
// v1.3 used text.includes(word), so "tor" matched "history" and "gun" matched "begun".
// Words in space-separated scripts now need a word boundary; CJK words still match anywhere.
// All words are combined into one regular expression per script type, so a long list costs one pass.
(function (root) {
    const NO_SPACES = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/; // kana, Han, Hangul
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ');

    function compile(words) {
        const list = [...new Set(words.map((w) => norm(String(w || '').trim())).filter(Boolean))]
            .sort((a, b) => b.length - a.length); // prefer the longest phrase at the same position
        const spaced = list.filter((w) => !NO_SPACES.test(w));
        const cjk = list.filter((w) => NO_SPACES.test(w));
        const compiled = list.map((word) => ({ word })); // array form kept for callers that list the words
        compiled.byText = new Map(list.map((w) => [w, w]));
        compiled.spaced = spaced.length
            ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${spaced.map((w) => escape(w).replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
            : null;
        compiled.cjk = cjk.length ? new RegExp(`(?:${cjk.map(escape).join('|')})`, 'gu') : null;
        return compiled;
    }

    function firstIn(re, text, map, skip) {
        if (!re) return null;
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) {
            const word = map.get(norm(m[0]));
            if (word && !(skip && skip.has(word))) return { word, index: m.index };
            if (m[0].length === 0) re.lastIndex++;
        }
        return null;
    }

    // Returns { word, index } for the earliest match, or null. `skip` holds words already cleared on this page.
    function findMatch(text, compiled, skip) {
        const a = firstIn(compiled.spaced, text, compiled.byText, skip);
        const b = firstIn(compiled.cjk, text, compiled.byText, skip);
        if (a && b) return a.index <= b.index ? a : b;
        return a || b;
    }

    root.SafeSurfKeywords = { compile, findMatch };
    if (typeof module !== 'undefined') module.exports = root.SafeSurfKeywords;
})(typeof globalThis !== 'undefined' ? globalThis : this);
