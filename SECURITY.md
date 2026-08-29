# Ledger, Security Review

**Project:** Ledger, Voice-Enabled Invoice Maker
**Review date:** 2026-08-29
**Scope:** The mobile app (iOS and Android, built with Capacitor) and the
optional hosted web version. Ledger used to be a plain website, but on this
branch it's really a mobile app, a native shell around the same React code,
with speech recognition and on-device PDF sharing. The web build still exists
but it's secondary now.
**Standard:** I went through the app against the OWASP **MASVS** (a common
checklist for mobile app security). This isn't an official audit by a firm, it's
my own review, written by me, and a few of the boxes don't even apply to an app
like this.

---

## Quick summary

Ledger is a small, deliberately simple invoice app. There are **no user
accounts**, it **doesn't save anything**, and there's **no backend database**.
You open it, say your invoice out loud (or type it), and it makes a PDF you
share straight from your phone. Because there are no accounts and nothing is
stored, a lot of the scary security stuff just doesn't apply here, there's no
place to break into and no data to steal.

I still did a pass and fixed the things that were actually reachable:

1. The one server endpoint (only used by the web version) could be spammed.
2. The app's debug console could accidentally ship in a release build.
3. There was no automatic check for libraries with known security holes.

I explain each of those below, plus the things I chose **not** to add and why.
The whole point of this was to learn and to be able to defend each choice.

---

## How I'm labeling things

| Label | What it means |
|---|---|
| **Fixed** | I found something real and did something about it. Details below. |
| **Accepted risk** | A real weakness, but for *this* app it's not worth fixing, I explain why. |
| **N/A** | The category doesn't even apply, because the app doesn't have that feature. |

---

## 1. Things I fixed

### 1.1 The PDF endpoint could be spammed (web version only)

- **OWASP:** MASVS-CODE-3 (unsafe handling of untrusted data), MASWE-0050
- **Severity before the fix:** High
- **File:** `app/api/generate-pdf/route.ts`

**The problem:** The only server endpoint, `POST /api/generate-pdf`, accepts
JSON and makes a PDF from it. Since there's no login, **anyone on the internet
could just send it requests**, a giant request, a huge number, a weird string,
and the server would do the work anyway. If a bunch of people did that at once,
it would chew up CPU and memory for no reason, which is basically a mini
denial-of-service. It also let people shove oversized or weird values into the
PDF tool (`pdf-lib`), which is asking for trouble.

**What I changed** (all in `app/api/generate-pdf/route.ts`):
1. **A size limit.** If a request's body is bigger than 100 KB, I reject it
   before even looking at what's inside. (Web browsers never send anything that
   big for a real invoice, so this is safe to cap.)
2. **Checking the fields.** I now check that all the required fields exist,
   text isn't crazy-long, and the numbers are actually numbers. Huge or
   non-finite numbers get thrown out. An invoice for `99999999999` hours is
   not a real invoice.
3. **A request limit.** Each IP can only ask the server 30 times per minute.
   Past that, it says "slow down" and won't do the work.
4. **Better error handling.** If someone sends garbage that isn't even valid
   JSON, it's caught and handled instead of crashing something.

**Did it work?** I tested it: bad input comes back with a clear error, an
oversized request gets rejected, a burst of requests over the limit gets
throttled, and a normal request still returns a correct PDF.

---

### 1.2 Debug mode could leak into the release app

- **OWASP:** MASVS-RESILIENCE-4 / MASWE-0061 (debug artifacts left in), MASTG-BEST-0008, BEST-0022
- **Severity before the fix:** Low
- **Files:** `ios/debug.xcconfig`, `ios/App/App.xcodeproj/project.pbxproj`

**The problem:** While you're building an app, it's really handy to turn on
something called remote debugging, it lets you pop open a live console and
inspect the screen, just like debugging a website. Capacitor does this with a
setting called `CAPACITOR_DEBUG`. The catch: if that setting is ever on in the
**release** build (the one people actually download), then someone who gets a
hold of that debug console could poke around inside the app and look at the
invoice data that's on screen. That's fine for a developer, not great for a
real user.

**What I changed:** I looked at the build setup and saw that the Release
configuration didn't explicitly turn debugging off, it just kind of... wasn't
set, which left it up to chance. So I added `CAPACITOR_DEBUG = false` to both
Release build settings in `project.pbxproj`. Now a release build is guaranteed
to have debugging off, no matter what.

**Did it work?** I ran `xcodebuild` and confirmed the Release build now shows
debugging off, while the Debug build still shows it on for development.

---

### 1.3 No automatic check for unsafe libraries

- **OWASP:** MASVS-CODE-2 / MASWE-0044 (dependencies with known vulnerabilities)
- **Severity before the fix:** Medium
- **File:** `.github/workflows/ci.yml`

**The problem:** Almost every app uses libraries ("dependencies"), and
sometimes those libraries turn out to have known security holes. People publish
these holes (called CVEs) so everyone can fix them. Before this change, nothing
was automatically checking whether my dependencies had any. Something could be
added and just sit there with a known hole, and nobody would notice.

**What I changed:** I added a step to the CI pipeline (the automated checks that
run on every push) that runs `npm audit --audit-level=high`. That flags any
dependency with a known high-severity problem right in the build log.

**One catch, why it doesn't fail the build:** Right now the audit does report
some issues, and the only way to fully fix the main one is a big Next.js
upgrade that I want to do carefully on its own. So I set this step up to **report
the issues without failing** the whole build yet. That way it's still visible
and catches any *new* problem, but it doesn't block everything while I sort out
the one big upgrade. See **Section 2.1** for the full explanation.

---

## 2. Accepted risks (I chose not to fix these, here's why)

### 2.1 Known dependency vulnerabilities

- **OWASP:** MASVS-CODE-2 / MASWE-0044
- **Severity:** High (Next.js), Critical (tar, build tools)

**The problem:** `npm audit` reports 13 issues (3 moderate, 9 high, 1 critical).
I split them into two groups:

**Group 1, Next.js (`next@14.2.35`).** Next.js is the framework that builds
the web view that the app wraps. It's flagged in several advisories (things like
DoS and request-smuggling). But here's the important part:

- **This app doesn't use the risky features.** Most of those advisories are
  about `next/image`, middleware, Server Actions, and rewrite rules, and this
  app uses **none of those**. I checked. So most of the warnings don't actually
  apply to how this app is built.
- **Fixing it needs a big upgrade.** The only fully patched version is
  `next@16`, but that's a *major version jump* from `14`, which can break
  things. Doing that quietly tucked inside this change would be how people
  break stuff. I'd rather do that as its own careful change and test it properly.

**Group 2, build-time tools** (`@capacitor/cli`, `@capacitor/assets`, `tar`,
`xcode`, `uuid`, `sharp`). These aren't part of the app at all. They only run on
a developer's computer (or in CI) while building the app or its icons. The
`tar` critical one is about the build machine, not about people using the app.

**Why the CI step reports instead of failing:** If I made it fail on issues I
already know about and can't fully fix without a big upgrade, then every single
push would be red forever, and a check that's always red is a check nobody
looks at. Better to have it running, visible, and catching anything *new*.

**My plan:** do the Next 16 upgrade in its own pull request first, then turn the
audit back into a hard fail once the code is clean.

---

## 3. Things that don't apply (probably the most important section)

A ton of app security checklists are about features this app simply doesn't have.
Here's each one and why I marked it N/A:

| OWASP category | Why it's N/A |
|---|---|
| **MASVS-AUTH** (login / accounts) | There are no accounts and no login. Nothing to break into. Adding a login to an app with no users would be fake security. |
| **MASVS-STORAGE** (saving data safely) | The app **saves nothing**. No database, no local storage. The invoice only exists in memory until you share it. Nothing to protect. |
| **MASVS-CRYPTO** (encryption) | No secrets or keys are stored or sent. It all goes over HTTPS, which handles the transport. Writing my own encryption would be *more* risky, not less. |
| **MASVS-NETWORK-1 / certificate pinning** | Everything uses HTTPS already, and the app sends no tokens or secrets. I actually looked at adding "certificate pinning" but decided against it: it only helps against attacks the app isn't exposed to, and it makes the app break if the certificate ever changes. Not worth the fragility. |
| **MASVS-RESILIENCE** (jailbreak detection, obfuscation) | This is an open-source app by choice, and there's no secret inside worth hiding. Adding jailbreak-detection or weird code-obfuscation would just add bugs, protecting nothing real. |
| **MASVS-PLATFORM** (deep links, intents, etc.) | No custom deep links, no special URLs, nothing like that. The only share action is the user tapping "share" and handing a PDF to the OS. |
| **MASVS-PRIVACY** | The only sensitive permission is the microphone for speech. I've declared why it's needed in the app's permission descriptions (`NSMicrophoneUsageDescription`, etc.). No tracking, no analytics, no selling of data. |
| **Server / cloud stuff (IAM, WAF, secrets vault)** | There's no real backend. Just a static site and one API route (which only the web version even uses). No cloud accounts, no keys, nothing to guard. |

---

## 4. What I was glad NOT to find

I looked through the code and the git history for accidentally-committed secrets
(API keys, passwords) using a tool called `gitleaks`, and there were **none**.
The `.env` files are also properly set to never be tracked. That's a relief, and
worth keeping that way.

---

## 5. What I'd do next (if this keeps going)

1. **Upgrade Next.js** to a patched version (`14.2.35` → `16.x`) in its own
   pull request, then turn the dependency audit back into a hard fail. This is
   the main thing left, see **Section 2.1**.
2. Maybe add **certificate pinning** if the app ever starts talking to a backend
   that handles sensitive data. Right now it doesn't, so I'm leaving it out.
3. If the app ever starts **saving data or adding accounts**, then I'd add proper
   encrypted storage and (maybe) Face ID / fingerprint login. But I'll only do
   that when there's actually something worth protecting, not before.

---

## 6. Where the standards come from

- OWASP MASVS, https://mas.owasp.org/MASVS/
- OWASP MASTG, https://mas.owasp.org/MASTG/
- npm audit docs, https://docs.npmjs.com/cli/v10/commands/npm-audit
- Gitleaks (secret scanning), https://github.com/gitleaks/gitleaks
- Capacitor debug setting, https://capacitorjs.com/docs/guides/live-reload
