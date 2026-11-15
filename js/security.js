// Master password hashing (classic script for popup, options and blocked pages).
// v1.3 stored the password in plain text. It is now stored as PBKDF2-SHA256; an old plain-text
// password still unlocks once and is then replaced by its hash.
const SafeSurfSecurity = (() => {
    const ITERATIONS = 210000;
    const PREFIX = 'pbkdf2';
    const enc = new TextEncoder();
    const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

    async function derive(password, salt, iterations) {
        const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
        return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
    }

    const isHashed = (stored) => typeof stored === 'string' && stored.startsWith(PREFIX + '$');

    async function hash(password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const bits = await derive(password, salt, ITERATIONS);
        return `${PREFIX}$${ITERATIONS}$${toB64(salt)}$${toB64(bits)}`;
    }

    async function verify(input, stored) {
        if (!stored || typeof input !== 'string') return false;
        if (!isHashed(stored)) return input === stored; // legacy plain text
        const [, iter, saltB64, hashB64] = stored.split('$');
        const bits = new Uint8Array(await derive(input, fromB64(saltB64), Number(iter)));
        const expected = fromB64(hashB64);
        if (bits.length !== expected.length) return false;
        let diff = 0;
        for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
        return diff === 0;
    }

    // Checks the input against storage and upgrades a legacy plain-text password to a hash.
    async function check(input) {
        const { password } = await chrome.storage.local.get('password');
        const ok = await verify(input, password);
        if (ok && !isHashed(password)) await chrome.storage.local.set({ password: await hash(input) });
        return ok;
    }

    // Value to store for a new password ('' keeps the "no password" meaning of v1.3).
    const toStored = async (password) => (password === '' ? '' : hash(password));

    return { hash, verify, check, toStored, isHashed };
})();
