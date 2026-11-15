// Bundles the ES-module pages (Firebase SDK) into lib/. Everything else loads as-is.
// MV3 forbids remote code, so the Firebase SDK must be bundled into the extension.
import * as esbuild from 'esbuild';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const ENV_FILE = '.env.local';

function readEnv() {
    if (!existsSync(ENV_FILE)) return {};
    return Object.fromEntries(
        readFileSync(ENV_FILE, 'utf8').split('\n')
            .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
            .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
    );
}

const env = readEnv();
let token = env.APPCHECK_DEBUG_TOKEN || '';
if (!token && process.env.CI !== 'true') {
    token = randomUUID();
    appendFileSync(ENV_FILE, `APPCHECK_DEBUG_TOKEN=${token}\n`);
    console.log(`\nCreated an App Check debug token in ${ENV_FILE}: ${token}`);
    console.log('Register it in Firebase console > App Check > Apps > (web app) > Manage debug tokens,');
    console.log('otherwise cloud AI calls are rejected (on-device AI and keywords still work).\n');
}

const options = {
    entryPoints: { offscreen: 'src/offscreen.js', family: 'src/family.js' },
    outdir: 'lib',
    bundle: true,
    format: 'esm',
    target: 'chrome120',
    sourcemap: true,
    legalComments: 'none',
    define: { __APPCHECK_DEBUG_TOKEN__: JSON.stringify(token) },
    logLevel: 'info'
};

if (process.argv.includes('--watch')) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
} else {
    await esbuild.build(options);
}
