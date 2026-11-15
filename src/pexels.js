// Pexels photo search for the backgrounds. The API key is not in the code or the repository:
// it's the Remote Config parameter `pexels_api_key`, fetched at runtime (free Spark plan, no server).
import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config';
import { app } from './firebase.js';

const CATEGORIES = new Set(['abstract', 'animals', 'streetlife', 'nature', 'cyber-landscapes', 'toys']);
let keyPromise = null;

function pexelsKey() {
    keyPromise ??= (async () => {
        const rc = getRemoteConfig(app);
        rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
        await fetchAndActivate(rc);
        const key = getValue(rc, 'pexels_api_key').asString();
        if (!key) throw new Error('pexels_api_key is not set in Remote Config');
        return key;
    })().catch((e) => { keyPromise = null; throw e; });
    return keyPromise;
}

/** Returns { photos: [{ id, alt, photographer, photographer_url, src: { medium, large2x } }], nextPage } */
export async function searchPexels({ query, page = 1, perPage = 14 }) {
    if (!CATEGORIES.has(query)) throw new Error('unknown category');
    const p = Math.min(Math.max(1, Number(page) || 1), 50);
    const n = Math.min(Math.max(1, Number(perPage) || 14), 40);
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${n}&page=${p}&orientation=landscape`;
    const res = await fetch(url, { headers: { Authorization: await pexelsKey() } });
    if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
    const data = await res.json();
    return {
        nextPage: !!data.next_page,
        photos: (data.photos || []).map((ph) => ({
            id: ph.id,
            alt: ph.alt || '',
            photographer: ph.photographer,
            photographer_url: ph.photographer_url,
            src: { medium: ph.src.medium, large2x: ph.src.large2x }
        }))
    };
}
