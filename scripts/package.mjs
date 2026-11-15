// Builds dist/senior-safesurf.zip: a ready-to-load extension (Load unpacked, no Node needed).
// Contains only runtime files: no sources, tests, source maps or local secrets.
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';

const env = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
if (/^\s*CLOUD_VIA\s*=\s*direct/m.test(env)) {
    console.error('Refusing to package a CLOUD_VIA=direct build: it would contain an App Check debug token.');
    process.exit(1);
}

execSync('node build.mjs', { stdio: 'inherit' });

const include = [
    'manifest.json', 'LICENSE', '_locales', 'icons', 'css', 'js', 'lib/offscreen.js', 'lib/family.js',
    'background.js', 'ai_router.js', 'content_filter.js', 'senior_overlay.js', 'spa_sentinel.js',
    'popup.html', 'popup.js', 'popup_ai.js', 'options.html', 'options.js', 'ai_options.js',
    'blocked.html', 'blocked.js', 'welcome.html', 'welcome.js', 'offscreen.html', 'forbidden_bg.png'
].filter((p) => existsSync(p));

mkdirSync('dist', { recursive: true });
rmSync('dist/senior-safesurf.zip', { force: true });
// Files go inside a senior-safesurf/ folder, so unzipping gives one folder to pick in "Load unpacked".
execSync('rm -rf dist/senior-safesurf && mkdir -p dist/senior-safesurf');
for (const p of include) {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    if (dir) mkdirSync(`dist/senior-safesurf/${dir}`, { recursive: true });
    execSync(`cp -R "${p}" "dist/senior-safesurf/${dir ? dir + '/' : ''}"`);
}
execSync('cd dist && zip -qr senior-safesurf.zip senior-safesurf -x "*.map" "*.DS_Store"');
const size = execSync('du -h dist/senior-safesurf.zip').toString().split('\t')[0];
console.log(`dist/senior-safesurf.zip (${size})`);
