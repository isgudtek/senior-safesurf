// Writes remoteconfig.generated.json (gitignored) = remoteconfig.template.json + secrets from .env.local,
// so the Pexels key reaches Remote Config without ever being committed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const env = existsSync('.env.local')
    ? Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
        .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
    : {};

const template = JSON.parse(readFileSync('remoteconfig.template.json', 'utf8'));
const key = process.env.PEXELS_API_KEY || env.PEXELS_API_KEY;
if (!key) {
    console.error('PEXELS_API_KEY is missing from .env.local; refusing to publish an empty key.');
    process.exit(1);
}
template.parameters.pexels_api_key.defaultValue.value = key;
writeFileSync('remoteconfig.generated.json', JSON.stringify(template, null, 2));
console.log('remoteconfig.generated.json written (pexels_api_key filled from .env.local).');
