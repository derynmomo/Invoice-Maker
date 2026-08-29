# Ledger — Mobile / Web AppSec Assessment

**Project:** Ledger — Voice-Enabled Invoice Maker
**Assessment date:** 2026-08-29
**Scope:** iOS + Android (Capacitor), hosted web app, and the `/api/generate-pdf` server route
**Standard:** Assessed against the OWASP **Mobile Application Security Verification Standard (MASVS)** and cross-referenced with **MASWE** weakness classes. This document is a learning artifact written by the app author.

---

## Executive summary

Ledger is a small, intentionally minimal invoice app with no user accounts, no
persistent data storage, and no backend database. An initial security review
was performed against OWASP MASVS. Because the app deliberately stores no data
and has no authentication surface, most high-severity mobile- and web-security
categories do not apply. Three concrete controls were implemented to close the
real, in-scope surface: server-side request hardening (input validation, size
cap, rate limiting), disabling remote WebView debugging in release builds, and
adding a continuous dependency-vulnerability scan to CI. Residual items are
documented below as accepted risk with explicit rationale.

---

## Terminology

| Disposition | Meaning |
|---|---|
| **Fixed** | A finding addressed in this pass, with how/where it was fixed. |
| **Accepted risk** | A real weakness judged low-impact for *this* app, intentionally not fixed, with reason. |
| **N/A** | A MASVS category that does not apply because the app does not have that surface (no accounts, no data stored, etc.). |

---

## 1. Findings — Fixed

### 1.1 Unauthenticated, unlimited PDF generation endpoint (DoS / resource abuse)

- **OWASP:** MASVS-CODE-3 (Unsafe handling of untrusted data) / MASWE-0050
- **Severity (pre-fix):** High
- **File:** `app/api/generate-pdf/route.ts`

**Finding:** The only server endpoint, `POST /api/generate-pdf`, accepted arbitrary
JSON with **no authentication, no request-size limit, no rate limit, and only
shallow field checks**. Because the app has no login, anyone could flood it with
large/malformed requests, wasting CPU and memory (a denial-of-service / resource-
exhaustion surface), and pass oversized strings or non-finite numbers into the
PDF renderer (`pdf-lib`).

**Fix applied (all in `app/api/generate-pdf/route.ts`):**
1. **Body size cap** — requests larger than 100 KB are rejected with `413` before parsing.
2. **Field-level validation** — required fields, string length caps, and strict
   JSON-number type checks; non-finite or absurd values (magnitude > 1e9) are rejected with `400`.
3. **Rate limiting** — a sliding-window limiter allows 30 requests/minute per IP,
   returning `429` beyond that (in-memory; single-instance, sufficient for now).
4. **Robust JSON parsing** — malformed bodies return `400` rather than a server error.

**Verification:** invalid/missing/oversized/out-of-range inputs return `400`/`413`;
valid requests return a correct PDF (`200`); burst requests beyond the limit return `429`.

---

### 1.2 Remote WebView debugging possible in a release build

- **OWASP:** MASVS-RESILIENCE-4 / MASWE-0061 (Debug artifacts not removed); MASTG-BEST-0008, BEST-0022
- **Severity (pre-fix):** Low
- **Files:** `ios/debug.xcconfig`, `ios/App/App.xcodeproj/project.pbxproj`

**Finding:** `debug.xcconfig` set `CAPACITOR_DEBUG = true` (used to enable the
WebView's remote debugging console). It was referenced by the **Debug** build
configurations, but nothing explicitly guarded the **Release** configuration.
If `debug.xcconfig` were ever wired into (or leaked into) a release build, remote
debugging could ship in production — allowing inspection/injection into the WebView,
where invoice data lives.

**Fix applied:**
- Added an explicit `CAPACITOR_DEBUG = false` to both **Release** build configurations
  in `project.pbxproj`, so release builds unambiguously disable WebView remote
  debugging regardless of xcconfig wiring.

**Verification:** `xcodebuild -showBuildSettings` confirms `CAPACITOR_DEBUG = false`
for `-configuration Release` and `true` for `Debug`.

---

### 1.3 No continuous dependency-vulnerability scanning

- **OWASP:** MASVS-CODE-2 / MASWE-0044 (Dependencies with known vulnerabilities)
- **Severity (pre-fix):** Medium
- **File:** `.github/workflows/ci.yml`

**Finding:** There was no automated check for known vulnerabilities (CVEs) in the
project's npm dependencies. Vulnerable transitive packages could be introduced or
updated into without detection.

**Fix applied:**
- Added an `npm audit --audit-level=high` step to the CI workflow so every push
  and PR surfaces dependency vulnerabilities in the Actions log.
- It is currently configured with `continue-on-error: true` — see **§2.1** for the
  honest rationale (known issues exist that require a deferred major upgrade, so
  the step *reports* rather than hard-blocks today).

---

## 2. Findings — Accepted risk (with rationale)

### 2.1 Known dependency vulnerabilities (npm audit)

- **OWASP:** MASVS-CODE-2 / MASWE-0044
- **Severity:** High (Next.js), Critical (tar, build-chain)

**Status: Accepted risk (tracked).**

**Finding (details):** `npm audit` reports 13 issues (3 moderate, 9 high, 1 critical).
These fall into two groups:

1. **Runtime — Next.js (`next@14.2.35`)**: the deployed web framework is flagged
   across many advisories (DoS, SSRF, cache poisoning, request smuggling).
   - **Not applicable to this app's configuration:** the app does **not** use
     `next/image`, middleware, Server Actions, rewrites, or redirects — the feature
     paths most of these advisories target. Confirmed by code review.
   - **Remediation requires a major upgrade:** the only patched version is
     `next@16.3.3` (a major, potentially breaking upgrade from 14.x). Deferred and
     tracked; the upgrade is scoped as a separate change so it can be reviewed
     independently.

2. **Build-chain tooling (`@capacitor/cli`, `@capacitor/assets`, `tar`, `xcode`,
   `uuid`, `sharp`)**: these are **build-time tools**, not part of the shipped app
   binary. They run only on a developer's machine / CI when generating the native
   projects or icons. The `tar` critical is a supply-chain concern for the build
   machine, not for end users of the app.

**Why `npm audit` uses `continue-on-error`:** hard-failing CI on known issues whose
only fix is a deferred breaking upgrade would make every push red — a broken gate that
nobody inspects. The step still runs and annotates every CI run, so **new** high/critical
issues become visible immediately, while the current known set is documented and tracked here.

**Recommended follow-up:** run the Next 16 upgrade in a dedicated PR and re-enable
`npm audit --audit-level=high` without `continue-on-error` when the runtime tree is clean.

---

## 3. Findings — Not applicable (Sizing / scope)

These MASVS categories do not apply because of deliberate app design:

| OWASP category | Why N/A |
|---|---|
| **MASVS-AUTH** (Authentication/Authorization) | No user accounts, no session, no login. There is nothing to authenticate. Adding auth would be artificial for this app. |
| **MASVS-STORAGE** (Data at rest) | The app persists **nothing** — no database, no `localStorage`. Invoice data exists only in memory until the user exports. Nothing to protect at rest or in Keychain. |
| **MASVS-CRYPTO** (Cryptography) | No secret/keys are stored or transmitted beyond HTTPS. No custom crypto is needed (and custom crypto would be a risk). |
| **MASVS-NETWORK-1 / pinning** | All transport uses HTTPS. The app sends no tokens/secrets. Certificate pinning was **evaluated and rejected**: it protects against MITM where the app currently exposes nothing worth that threat-modeling cost, and it adds fragility (breaks if the cert rotates). |
| **MASVS-RESILIENCE** (Jailbreak/root detection, obfuscation, anti-reversing) | Could be added, but the app is open-source by choice and holds no secrets worth protecting. Detection/obfuscation would add bugs without protecting anything real — judged out of proportion. |
| **MASVS-PLATFORM** (Deep links, intents, IPC, clipboard) | No custom URL schemes, deep links, IPC, or exported components. The one share action is user-initiated and hands a PDF to the OS share sheet. |
| **MASVS-PRIVACY** | Mic + speech are the only sensitive permissions, and both are declared with usage strings (`NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`, `RECORD_AUDIO`). No tracking, no analytics, no third-party data collection. |
| **Server/Cloud (IAM, WAF, vault)** | The "backend" is a single static site + one API route. No cloud IAM, no secrets vault, no multi-instance infra to secure. |

---

## 4. What was NOT found (clean results)

Manual review and `gitleaks` scanning found **no hardcoded secrets or API keys**
in the repository or history. `.env*` files are correctly `gitignored`. These are
positive findings worth keeping.

---

## 5. Remediation roadmap (future)

1. **Upgrade Next.js to a patched version** (currently `14.2.35` → `16.x`) in a
   dedicated PR; then re-enable hard `npm audit` gating. (Top priority — see §2.1.)
2. Optionally add TLS **certificate pinning** if/when a backend API handles
   sensitive data or tokens. (Deferred — see §3, MASVS-NETWORK.)
3. If the app ever gains persistence or accounts, add Keychain/Keystore-backed
   encrypted storage and biometric auth at that point — justified only when such
   data actually exists.

---

## 6. References

- OWASP MASVS — https://mas.owasp.org/MASVS/
- OWASP MASTG — https://mas.owasp.org/MASTG/
- npm audit docs — https://docs.npmjs.com/cli/v10/commands/npm-audit
- Gitleaks (secret scanning) — https://github.com/gitleaks/gitleaks
- Capacitor remoting / `CAPACITOR_DEBUG` — https://capacitorjs.com/docs/guides/live-reload
