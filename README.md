# Senior SafeSurf

## Inspiration

Older adults are one of the fastest-growing groups online, and the group that loses the most when something
goes wrong.

- **A growing audience.** By 2030, one in six people in the world will be 60 or older
  ([WHO](https://www.who.int/news-room/fact-sheets/detail/ageing-and-health)). Most of them now browse,
  shop, bank and talk to family online, often on their own.
- **An internet that targets them.** In 2025 the FBI's Internet Crime Complaint Center received about
  201,000 complaints from people over 60. Their reported losses were about **$7.7 billion**, 37% more than
  in 2024 and over a third of all reported losses
  ([FBI](https://fbi.gov/news/press-releases/cryptocurrency-and-ai-scams-bilk-americans-of-billions),
  [IC3 2025 figures](https://elaca.org/2025-ic3-report-snapshot/)). The average loss per older victim was
  about 1.9 times the overall average. Fake tech support, fake bank alerts and "you've won" prizes are the
  usual way in.
- **Tools that don't fit them.** Parental-control and security tools are built for children or IT
  departments. They're full of settings, and word lists both block too much and miss what matters. Our own
  v1.3 blocked any page containing "history", because it contains "tor". It also missed scams, which rarely
  use a word on a list.

We built Senior SafeSurf for that gap: big buttons, a calm interface, and protection that understands what a
page is actually doing, without sending a parent's browsing to a server. Hybrid AI makes that possible.
Gemini Nano runs on the computer, so judging every page stays private, offline and free. Gemini in the cloud
helps only when the computer can't, and only if the user agreed.

## What it is

A free Chrome extension that keeps older adults safe online. It blocks sites and keywords, warns about scams,
and adds a large-button speed dial and a reading-assist toolbar. Version 2 adds a **hybrid AI check built on
Firebase AI Logic**: Gemini Nano runs on the computer first, and Gemini in the cloud is used only when the
on-device model is missing or unsure, and only if the user allowed it.

Every feature is free. There is no paid tier, no license server and no backend of our own.

## Screenshots

| | |
|---|---|
| ![Welcome screen: Now with local AI through Firebase](docs/screenshots/welcome-payoff.png) | ![Blocked page with the AI's reason](docs/screenshots/blocked-page.png) |
| **First run.** The new opening slide. | **Blocked page.** The AI explains why ("Blocked: gambling…") and where it checked. |
| ![Scam warning banner on a fake bank login page](docs/screenshots/scam-warning.png) | ![Popup: Is this page safe?](docs/screenshots/popup-check.png) |
| **Scam warning.** A fake bank login page with no blocked word still gets a warning. | **Popup.** One click: "Is this page safe?" |
| ![Settings: AI Protection](docs/screenshots/ai-protection.png) | ![Family log and weekly AI summary](docs/screenshots/family.png) |
| **AI Protection** (top of Settings › Instructions): mode, on-device status, cloud consent, fine-tuning, Try it. | **Family.** This week's blocks and warnings, with a plain-language AI summary. |
| ![Senior Assist toolbar: safety check on a fake bank page](docs/screenshots/overlay-check-unsafe.png) | ![Senior Assist toolbar: safety check on a recipe page](docs/screenshots/overlay-check-safe.png) |
| **Senior Assist toolbar.** The round 🛡 button next to Aa−/Aa+ checks the page and answers on the page. | The same check on a harmless page. |
| ![Welcome screen: on-device AI and cloud consent](docs/screenshots/welcome-ai.png) | ![Try it: scam text checked](docs/screenshots/try-it.png) |
| **Setup slide.** Checks the computer, starts the Gemini Nano download, asks for cloud consent. | **Try it.** Any text, with verdict, type, confidence, engine and time. |

These were captured from the real extension with real AI answers, in a test browser that has no Gemini Nano.
That's why the status reads "cannot run on-device AI" and the results say "Checked in the cloud". It also shows
the fallback working. On a computer with Gemini Nano, the same views show "Ready on this computer" and
"🔒 Checked on this computer".

## Why AI, and why on-device first

Keyword lists fail older users in both directions:

- **Too strict.** A blocked word like "gun" also blocks a museum page about frontier history, and "tor"
  matched "history" in v1.3. Users learn to turn protection off.
- **Too weak.** Scams rarely use the exact words on a list. A fake "account suspended" login page or a fake
  tech-support alert slips through.

The AI reads the page around a blocked word and decides whether the mention is harmful, and it checks login and
payment pages for phishing signs. Page text is personal (health, banking, family), so the AI runs **on the
computer with Gemini Nano** whenever possible: private, offline, and free. The cloud model is a fallback, not
the default path.

## What the AI does

| Where | What happens | Engine |
|---|---|---|
| A stop word appears on a page | The page is covered ("checking…") and the AI judges the word in context: **block**, **warn** or **allow** | Nano first, cloud fallback |
| A page asks for a password or card number, or posts a form to another site | One background check; a confident scam/phishing verdict shows a large warning banner (never a hard block) | Nano first, cloud fallback |
| Popup: **🛡 Is this page safe?** | Plain-language answer for the open tab | Nano first, cloud fallback |
| Any scam/phishing warning or "not safe" result | **⛔ Block this site** adds the site to Blocked Sites and reloads, so the block page appears | – |
| Senior Assist toolbar: round **🛡** button | The same check from the on-page toolbar (next to Aa−/Aa+), with the answer in a card on the page | Nano first, cloud fallback |
| Blocked page | Shows the AI's reason ("Blocked: gambling. …") and where it was checked | – |
| Family: **Write summary** | Weekly plain-language summary of blocks and warnings | Nano first, cloud fallback |

Every result says where it ran: 🔒 *Checked on this computer (Gemini Nano)* or ☁️ *Checked in the cloud*.

## The switches

**Settings › Instructions › AI Protection**

| Setting | Values | Default |
|---|---|---|
| Where the AI runs (`aiMode`) | Off (keywords only) · On this computer only · Hybrid · Cloud only | Hybrid |
| Allow cloud checks (`aiCloudConsent`) | on / off | asked on the welcome screen |
| Sensitivity (`aiSensitivity`) | Relaxed · Balanced · Strict | Balanced |
| Scam check on login and payment pages (`aiScanScope`) | on / off | on |
| Use Firebase Remote Config (`aiUseRemoteConfig`) | on / off | off |

The popup has a compact copy of the mode switch.

Routing rules (`src/engine.js › planRoute`):

- **Off**: keywords only, exactly like v1.3.
- **On this computer only**: Gemini Nano. If it isn't available, keywords. Never the cloud.
- **Hybrid**: Gemini Nano with `InferenceMode.PREFER_ON_DEVICE`. If Nano's confidence is below the escalation
  threshold (0.6), the same snapshot is re-checked once in the cloud. If Nano isn't available, cloud only.
  Cloud steps need consent.
- **Cloud only**: `InferenceMode.ONLY_IN_CLOUD`, needs consent.

Fail-safe rules (`ai_router.js › applyPolicy`):

- A keyword hit stays blocked unless the AI says "allow" with enough confidence (0.6 / 0.75 / 0.9 for
  Relaxed / Balanced / Strict). AI errors and timeouts keep the keyword block.
- A page without a keyword hit is only ever **warned** about, and only when the AI is confident.

### First use of the on-device model

Chrome downloads Gemini Nano (about 4 GB, once) the first time it's needed, and only after a user click:

- The welcome screen checks the computer. If the model is downloadable, pressing **Start protecting** starts
  the download and shows progress. Protection is on immediately; keywords and (if allowed) the cloud cover the
  wait.
- If the download isn't possible, the welcome screen and **AI Protection** say exactly why: Chrome older than
  138, or hardware below Chrome's requirements (Windows 10/11, macOS 13+, Linux or Chromebook Plus; 22 GB free
  disk; GPU with more than 4 GB VRAM or 16 GB RAM).
- **Settings › Instructions › AI Protection › Download on-device AI** and the popup's **Is this page safe?** button also start the
  download if it hasn't happened yet.

## What leaves the computer

Only for cloud checks, and only after consent, the extension sends a **snapshot** built by `js/snapshot.js`
(at most 3,000 characters):

- site name and path (no query string, no fragment), page title, meta description, up to 5 headings
- about 600 characters around the matched word (or the first 1,500 characters for a manual check)
- three flags: has a password field, has a card field, which other sites its forms post to

Never sent: passwords, form contents, cookies, the full address, the full page. Page text is treated as
untrusted: the prompt says so, the output must match a JSON schema, and the result is shown with
`textContent` only.

With **Family sharing** on, each block or warning is also written to Firestore: time, site name, verdict, type,
engine and the one-sentence reason. Never page text.

## Firebase products used

| Product | Used for | Code |
|---|---|---|
| **Firebase AI Logic** (hybrid inference) | Gemini Nano on-device + Gemini cloud fallback, structured JSON verdicts | `src/engine.js` |
| **App Check** (reCAPTCHA Enterprise) | Required by AI Logic; cloud calls are attested on the hosted bridge page | `src/cloud-bridge.js` |
| **Hosting** | Serves the cloud bridge (`senior-safesurf.web.app`) | `web/`, `firebase.json` |
| **Remote Config** | Optional AI tuning (cloud kill switch, cloud model, escalation threshold, extra prompt guidance), and the Pexels API key for background photos, so no key is in the code | `src/engine.js`, `src/pexels.js`, `remoteconfig.template.json` |
| **Authentication** (email/password) | Optional family account | `src/family.js` |
| **Cloud Firestore** | Optional shared family log, owner-only and append-only rules | `src/offscreen.js`, `src/family.js`, `firestore.rules` |

## Architecture

```mermaid
flowchart LR
  CS[content_filter.js<br/>stop word or risky page] -->|analyzePage: snapshot ≤3 KB| SW[background.js + ai_router.js<br/>switches, consent, policy, log]
  P[popup: Is this page safe?] -->|checkActiveTab| SW
  SW -->|aiMode off| KW[keyword verdict]
  SW -->|target: offscreen| OS[offscreen.html → lib/offscreen.js<br/>Firebase AI Logic]
  OS -->|Nano available| ND[🔒 Gemini Nano<br/>Chrome Prompt API]
  OS -->|fallback / escalation, with consent| BR[hidden iframe<br/>senior-safesurf.web.app/cloud.html]
  BR -->|App Check: reCAPTCHA Enterprise| CL[☁️ Gemini via Firebase AI Logic]
  OS -->|family sharing on| FS[(Firestore<br/>families/uid/events)]
  OS --> SW
  SW -->|block| BL[blocked.html: reason + engine]
  SW -->|warn| BN[warning banner]
```

- Content scripts are classic scripts and can't load the Firebase SDK, so they only build the snapshot.
- The service worker applies the switches and the fail-safe policy and keeps a local, capped block log
  (200 entries, no page text).
- The SDK runs in an **offscreen document** (`DOM_PARSER` reason), bundled with esbuild because Manifest V3
  forbids remote code. Auth uses `firebase/auth/web-extension`, which never loads remote scripts.

## Where your data lives

Most of Senior SafeSurf never touches a server. This table lists every place data is stored or sent, and
**whether a Firebase service is involved**.

| What | Where it's stored or sent | Firebase? | When |
|---|---|---|---|
| Settings, blocked sites, stop words, speed dial, AI switches | `chrome.storage.local` on this computer | **No** | Always |
| Master password | `chrome.storage.local`, as a PBKDF2-SHA256 hash | **No** | If set |
| Block log (last 200 blocks/warnings: time, site, type, engine, reason) | `chrome.storage.local` | **No** | Always |
| **Export JSON / Import JSON** (Blocked Sites page) | A `.json` file you download and pick again later. It contains only the blocked-sites list | **No.** There is no cloud backup | When you click |
| On-device AI checks | Gemini Nano inside Chrome | **No** network at all (Firebase AI Logic SDK, on-device mode) | Nano available, mode Local or Hybrid |
| Cloud AI checks | Page snapshot (≤ 3 KB) → `senior-safesurf.web.app` bridge → Gemini | **Yes:** AI Logic, App Check, Hosting. Nothing is stored | Only with cloud consent |
| AI tuning values and the Pexels key | Read from Remote Config | **Yes:** Remote Config (read-only) | When the engine starts |
| Background photos | Pexels API → photo URLs | Key from Remote Config; photos come from Pexels | When you open Appearance or a block page |
| **Family sharing** (optional, off by default) | Firestore `families/{uid}/events` | **Yes:** Authentication + Firestore | Only after signing in to a family account |

### How Family sharing identifies you

Sharing is tied to the **Firebase Authentication account** (email and password) you create in **Settings ›
Family**, not to the extension or the computer:

- Each account gets a Firebase user ID (`uid`). Events are written to `families/{uid}/events/{autoId}`.
- The extension ID isn't used for storage. It's only used so the cloud bridge answers Senior SafeSurf and
  nothing else.
- Any Chrome where you sign in with the same account reads and writes the same log. That's how a family member
  sees the parent's blocks.
- `firestore.rules` lets only that signed-in account read its own events. Entries can be added but never
  edited or deleted, and each one is checked for type and size.
- Signing out stops sharing on that computer. The local log keeps working.
- Settings, blocked sites and stop words are **not** synced. Use Export/Import to move the blocked-sites list
  between computers.

Status: the code and rules are in this repository. Sharing needs Firestore and Email/Password sign-in enabled
in the Firebase project (see **Setup › Firebase project**). Until then, **Sign in** shows "Email/password
sign-in is not enabled for this Firebase project yet", and everything else works.

## Family sharing (Firestore)

Optional, off by default. It lets a son or daughter see what was blocked on a parent's computer.

1. In **Settings › Family**, create one family account (email + password) on the parent's computer. Sharing
   turns on.
2. Install Senior SafeSurf on the family member's Chrome, open **Settings › Family** and sign in with the same
   account.
3. Both computers now show the shared log for the last 7 days. **Write summary** produces a short weekly
   summary, on-device when possible.

Data model: `families/{uid}/events/{autoId}` = `{ ts, host, verdict, category, engine, reason, createdAt }`.
`firestore.rules` allows only the signed-in owner to read, validates every field on create, and forbids updates
and deletes, so a log entry can't be edited later.

## Setup

Requirements: Node 20+, desktop Chrome 138+.

```bash
npm install
npm run build        # bundles the Firebase SDK into lib/ (extension) and web-dist/ (cloud bridge)
npm test             # unit tests (keywords, routing, policy, verdict parsing)
```

Load it: `chrome://extensions` → Developer mode → **Load unpacked** → this folder.

### App Check and the cloud bridge

Firebase AI Logic enforces App Check on every cloud call, and reCAPTCHA can't run on a `chrome-extension://`
origin. So the extension sends cloud requests through a small hosted page, **`https://senior-safesurf.web.app/cloud.html`**
(`src/cloud-bridge.js`), which the AI engine loads in a hidden iframe:

- The page runs Firebase AI Logic with **App Check backed by reCAPTCHA Enterprise**, so cloud calls are attested
  like any Firebase web app. **No debug token or secret is in the extension or in this repository**, and cloud
  checks work for every install, from the Chrome Web Store or from GitHub.
- It only answers `postMessage` requests from Senior SafeSurf's two extension IDs (store build and the unpacked
  build, pinned by the `key` in `manifest.json`), and its `frame-ancestors` header lets only those IDs embed it.
- It only accepts the two request types the extension uses (verdict JSON or summary text), with a size limit.
- On-device checks never touch the bridge: Gemini Nano runs inside the extension.

The bridge is deployed to its own Hosting site: `firebase deploy --only hosting:senior-safesurf`.

Developer option: put `CLOUD_VIA=direct` and a registered `APPCHECK_DEBUG_TOKEN` in `.env.local` to call the
cloud straight from the extension with the App Check debug provider. Never publish such a build.

### Firebase project

The extension uses the `hackathon-e2f2b` project (`.firebaserc`). To use your own, change `firebaseConfig` in
`src/firebase.js` and enable Firebase AI Logic (Gemini Developer API) and App Check.

For Family sharing:

1. Firebase console › **Firestore Database** › Create database (production mode).
2. Firebase console › **Authentication** › Get started › enable **Email/Password**.
3. Put `PEXELS_API_KEY=...` in `.env.local` (gitignored).
4. `npm run deploy:firebase` deploys `firestore.rules`, the bridge page and Remote Config. The Remote Config
   template in the repo has an empty `pexels_api_key`; `scripts/remote-config.mjs` fills it from `.env.local`
   at deploy time, so the key is never committed.

## What changed in v2 (built during #BuildHybridAI)

v1.3 (the published store version, packaged February 2026) is the first commit in this repository, so the diff
shows everything built for the hackathon. It was a keyword and site blocker with a paid PRO tier, and it had
**no AI of any kind**: stop words were matched with plain `text.includes(word)`. All AI in this repository was
added in v2. v2:

- **Hybrid AI** with Firebase AI Logic: on-device Gemini Nano, cloud Gemini fallback and low-confidence
  escalation, structured verdicts, four-way switch and explicit cloud consent.
- **AI in the right places**: keyword-hit verification, scam/phishing warnings on login and payment pages, the
  "Is this page safe?" popup check, AI reasons on the blocked page, weekly family summary.
- **First-use model download** on the welcome screen with progress, and a clear explanation when the computer
  can't run it.
- **Remote Config** (optional) for the cloud kill switch, model, threshold and prompt guidance.
- **Family sharing** with Firebase Auth and Firestore, owner-only append-only rules.
- **Free for everyone**: PRO tier, Stripe checkout, license checks, the PHP server and the `alarms` permission
  removed. The Pexels key that v1.3 hardcoded now comes from Remote Config at runtime. Support opens the user's mail app instead of posting to a server.
- **Fixes**: word-boundary keyword matching (Unicode, CJK aware) instead of `includes()`, debounced page
  re-scans, single-page-app navigation handling, master password stored as PBKDF2-SHA256 (plain-text passwords
  are upgraded on first unlock), AI text rendered with `textContent` only.

## Known limitations

- Gemini Nano needs desktop Chrome on capable hardware; phones and weaker computers use the cloud (with
  consent) or keywords.
- The on-device model is configured for English input and output. Pages in other languages still work, but the
  reason sentence is in English.
- Site blocks (declarativeNetRequest rules) happen before a page loads, so they aren't reviewed by the AI.

## License

Apache-2.0. See [LICENSE](LICENSE).
