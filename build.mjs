// Bundles the ES-module code (Firebase SDK) for the extension (lib/) and the hosted bridge (web-dist/).
// MV3 forbids remote code, so the Firebase SDK must be bundled into the extension.
import * as esbuild from 'esbuild';
import { existsSync, readFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';

function readEnv(file = '.env.local') {
    if (!existsSync(file)) return {};
    return Object.fromEntries(
        readFileSync(file, 'utf8').split('\n')
            .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
            .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
    );
}

// Default: cloud calls go through the hosted bridge and the build contains no token.
// Developers can set CLOUD_VIA=direct and APPCHECK_DEBUG_TOKEN in .env.local to call the cloud
// straight from the extension with a registered App Check debug token.
const env = { ...readEnv(), ...process.env };
const direct = env.CLOUD_VIA === 'direct' && !!env.APPCHECK_DEBUG_TOKEN;
const token = direct ? env.APPCHECK_DEBUG_TOKEN : '';
console.log(`Cloud path: ${direct ? 'direct (App Check debug token)' : 'hosted bridge (no token in the build)'}`);

const common = {
    bundle: true,
    format: 'esm',
    target: 'chrome120',
    sourcemap: true,
    legalComments: 'none',
    logLevel: 'info'
};

const extension = {
    ...common,
    entryPoints: { offscreen: 'src/offscreen.js', family: 'src/family.js' },
    outdir: 'lib',
    define: { __APPCHECK_DEBUG_TOKEN__: JSON.stringify(token) }
};

const web = { ...common, entryPoints: { cloud: 'src/cloud-bridge.js' }, outdir: 'web-dist', sourcemap: false, minify: true };

mkdirSync('web-dist', { recursive: true });
for (const f of readdirSync('web')) copyFileSync(`web/${f}`, `web-dist/${f}`);

if (process.argv.includes('--watch')) {
    await (await esbuild.context(extension)).watch();
    await (await esbuild.context(web)).watch();
} else {
    await esbuild.build(extension);
    await esbuild.build(web);
}
