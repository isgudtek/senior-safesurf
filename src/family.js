// Options page: "Family" section. Weekly log, AI summary, and optional Firestore sharing.
import {
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged
} from 'firebase/auth/web-extension';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const $ = (id) => document.getElementById(id);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const t = (key, fallback) => {
    const v = typeof i18nCustom !== 'undefined' ? i18nCustom.t(key) : key; // global from js/i18n.js
    return v && v !== key ? v : fallback;
};
const guard = async () => (typeof window.checkSecurity === 'function' ? window.checkSecurity() : true);

const ENGINE_ICON = { 'on-device': '🔒', cloud: '☁️', keywords: '🔤' };
let lastEvents = [];

async function loadEvents() {
    const since = Date.now() - WEEK_MS;
    const user = auth.currentUser;
    if (user) {
        try {
            const q = query(collection(db, 'families', user.uid, 'events'), where('ts', '>=', since), orderBy('ts', 'desc'), limit(200));
            const snap = await getDocs(q);
            $('logSourceNote').textContent = t('family_source_cloud', 'Shared family log (all computers signed in to this account).');
            return snap.docs.map((d) => d.data());
        } catch (e) {
            $('logSourceNote').textContent = t('family_source_error', 'Could not read the shared log, showing this computer only. ') + e.message;
        }
    } else {
        $('logSourceNote').textContent = t('family_source_local', 'This computer only.');
    }
    const { blockLog = [] } = await chrome.storage.local.get('blockLog');
    return blockLog.filter((e) => e.ts >= since);
}

function renderEvents(events) {
    const list = $('eventList');
    list.textContent = '';
    if (!events.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#64748b;text-align:center;padding:20px;';
        empty.textContent = t('family_empty', 'Nothing blocked or flagged this week.');
        list.appendChild(empty);
        return;
    }
    for (const e of events) {
        const item = document.createElement('div');
        item.className = 'options-item';
        const info = document.createElement('div');
        info.className = 'info';
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = `${e.verdict === 'warn' ? '⚠️' : '⛔'} ${e.host || '?'} · ${e.category}`;
        const desc = document.createElement('span');
        desc.className = 'description';
        desc.textContent = `${new Date(e.ts).toLocaleString()} · ${ENGINE_ICON[e.engine] || ''} ${e.engine}${e.reason ? ' · ' + e.reason : ''}`;
        info.append(name, desc);
        item.appendChild(info);
        list.appendChild(item);
    }
}

async function refresh() {
    lastEvents = await loadEvents();
    renderEvents(lastEvents);
}

async function writeSummary() {
    const box = $('summaryBox');
    const btn = $('summaryBtn');
    btn.disabled = true;
    box.classList.remove('hidden');
    box.textContent = t('ai_checking', 'Checking…');
    try {
        const res = await chrome.runtime.sendMessage({ command: 'aiSummary', events: lastEvents });
        if (res && res.text) {
            box.textContent = res.text;
            const meta = document.createElement('div');
            meta.style.cssText = 'font-size:12px;color:var(--text-muted);margin-top:8px;';
            meta.textContent = res.engine === 'on-device'
                ? t('engine_device', 'Checked on this computer (Gemini Nano). Nothing was sent online.')
                : t('engine_cloud', 'Checked in the cloud (Gemini via Firebase).');
            box.appendChild(meta);
        } else {
            box.textContent = t('summary_unavailable', 'The AI could not write a summary right now. ') + ((res && res.error) || '');
        }
    } finally {
        btn.disabled = false;
    }
}

function showMsg(text) { $('familyMsg').textContent = text || ''; }

async function afterAuthChange() {
    await chrome.runtime.sendMessage({ command: 'resetEngine' }); // engine picks up the new account
    refresh();
}

function authErrorText(e) {
    const code = (e && e.code) || '';
    if (code.includes('operation-not-allowed') || code.includes('configuration-not-found')) {
        return t('family_err_provider', 'Email/password sign-in is not enabled for this Firebase project yet.');
    }
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
        return t('family_err_credentials', 'Email or password is not correct.');
    }
    if (code.includes('email-already-in-use')) return t('family_err_exists', 'That account already exists. Use Sign in.');
    if (code.includes('weak-password')) return t('family_err_weak', 'Use a password with at least 6 characters.');
    return (e && e.message) || String(e);
}

function setup() {
    if (!$('section-family')) return;

    onAuthStateChanged(auth, async (user) => {
        $('familySignedOut').classList.toggle('hidden', !!user);
        $('familySignedIn').classList.toggle('hidden', !user);
        if (user) {
            $('familyWho').textContent = `${t('family_signed_in_as', 'Signed in as')} ${user.email}`;
            const { familySyncEnabled } = await chrome.storage.local.get('familySyncEnabled');
            $('familySyncToggle').checked = familySyncEnabled === true;
        }
        refresh();
    });

    $('familySignInBtn').addEventListener('click', async () => {
        if (!(await guard())) return;
        showMsg('');
        try {
            await signInWithEmailAndPassword(auth, $('familyEmail').value.trim(), $('familyPassword').value);
            $('familyPassword').value = '';
            await afterAuthChange();
        } catch (e) { showMsg(authErrorText(e)); }
    });

    $('familyCreateBtn').addEventListener('click', async () => {
        if (!(await guard())) return;
        showMsg('');
        try {
            await createUserWithEmailAndPassword(auth, $('familyEmail').value.trim(), $('familyPassword').value);
            $('familyPassword').value = '';
            await chrome.storage.local.set({ familySyncEnabled: true });
            await afterAuthChange();
            showMsg(t('family_created', 'Family account created. Sign in with it on the family member\'s Chrome too.'));
        } catch (e) { showMsg(authErrorText(e)); }
    });

    $('familySignOutBtn').addEventListener('click', async () => {
        if (!(await guard())) return;
        await signOut(auth);
        await chrome.storage.local.set({ familySyncEnabled: false });
        await afterAuthChange();
    });

    $('familySyncToggle').addEventListener('click', async (e) => { if (!(await guard())) e.preventDefault(); });
    $('familySyncToggle').addEventListener('change', (e) => chrome.storage.local.set({ familySyncEnabled: e.target.checked }));

    $('summaryBtn').addEventListener('click', writeSummary);
    $('clearLogBtn').addEventListener('click', async () => {
        if (!(await guard())) return;
        if (!confirm(t('family_clear_confirm', 'Clear the log on this computer? The shared family log is not changed.'))) return;
        await chrome.storage.local.set({ blockLog: [] });
        refresh();
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.blockLog && !auth.currentUser) refresh();
        // Keep the toggle in step with storage (e.g. "Create account" turns sharing on after sign-in fires).
        if (changes.familySyncEnabled) $('familySyncToggle').checked = changes.familySyncEnabled.newValue === true;
    });
}

// Module scripts run after the DOM is parsed.
setup();
