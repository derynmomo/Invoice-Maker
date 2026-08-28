# Ledger — Voice-Enabled Invoice Maker

A Next.js 14 (App Router) invoice builder with a live dual-pane preview, no-cost
browser speech recognition, local invoice-field extraction, and one-click PDF
generation shared through the OS share sheet. Also packaged as a native
**iOS + Android app** (Capacitor) with on-device speech recognition — see
[MOBILE.md](MOBILE.md) for the build and App Store / Google Play submission steps.

## 1. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS |
| Speech-to-text | Browser `SpeechRecognition` / `webkitSpeechRecognition` |
| Field extraction | Deterministic local TypeScript parser (no API call) |
| PDF generation | `pdf-lib` on the server (web) / in the browser (app) |
| Sharing | OS share sheet — `@capacitor/share` (app) / Web Share API (web) |
| Fonts | Space Grotesk (display), Inter (body), IBM Plex Mono (financial figures) |

## 2. Project structure

```
invoice-maker/
├─ app/
│  ├─ page.tsx                 # Main client page — state, validation, wiring
│  ├─ layout.tsx                # Root layout, font loading
│  ├─ globals.css               # Design tokens + print (@media print) styles
│  └─ api/
│     └─ generate-pdf/route.ts  # POST invoice → downloadable PDF
├─ components/
│  ├─ InvoiceForm.tsx           # Sections 1–4 + validation + tax presets
│  ├─ InvoicePreview.tsx        # Live invoice + "Share PDF" action
│  ├─ VoiceWidget.tsx           # Speech recognition UI (native or browser)
│  ├─ Stepper.tsx               # +/- quick-adjust control
│  └─ Toast.tsx                 # Toast notifications
├─ lib/
│  ├─ types.ts                  # Shared client/server types
│  ├─ localVoiceParser.ts       # Local transcript → invoice fields
│  ├─ speech.ts                 # Unified speech engine (native + web)
│  ├─ mobile.ts                 # Client-side PDF, download + share-sheet
│  └─ calculations.ts           # safeNumber/currency/computeTotals/etc.
├─ assets/                      # App icon + splash sources (scripts/generate-assets.js)
├─ ios/  android/               # Capacitor native projects (npm run sync)
└─ package.json
```

## 3. Setup

```bash
cd invoice-maker
npm install
npm run dev
# open http://localhost:3000
```

## 4. How the voice pipeline works

1. **Idle → Listening**: tapping the mic starts the browser/device speech recognizer. A
   60-second safety cap stops long dictation.
2. **Transcript**: the browser returns live and final transcript text. No app-owned speech API
   key is used and no transcription request is sent by the invoice server.
3. **Local extraction**: `lib/localVoiceParser.ts` recognizes explicit and relative dates,
   spoken or numeric hours, time ranges, hourly rates, and one or more material amounts. It also
   produces a concise work description using deterministic rules.
4. **Autofill + highlight**: only fields the local parser found are merged
   into form state; each touched field gets a 1.5s `pulse-highlight` animation so the user can
   visually confirm what changed, then review/edit normally.
5. Unsupported browsers, permission denial, no-speech results, and recognition errors surface
   a clear toast instead of throwing.

## 5. Calculations

All math funnels through `lib/calculations.ts`:

- `safeNumber()` clamps any input to a non-negative finite number — the single choke point
  that keeps `NaN`/negative values out of the UI, whether they came from typing, a stepper
  click, or the voice pipeline.
- `computeTotals()`: `laborSubtotal = hours × rate`, `subtotal = laborSubtotal + materialCost`,
  `taxAmount = subtotal × (taxRate / 100)`, `total = subtotal + taxAmount`.
- `currency()` formats everything as `$XX.XX` via `Intl`/`toLocaleString`.

## 6. PDF export

`POST /api/generate-pdf` uses `pdf-lib` to build a polished one-page invoice and returns it as
an attachment. "Download PDF" sends the current invoice data to that route and downloads the
result directly, without depending on the browser print dialog. Client first and last name are
required; email remains optional.

## 7. Sharing the invoice

There is no app-owned messaging backend — sharing hands the finished PDF to the
OS so the user can send it however they like.

- **Native app (iOS/Android)**: `lib/mobile.ts` generates the PDF client-side
  with `pdf-lib`, writes it to a temp file with `@capacitor/filesystem`, and
  calls `Share.share({ files })` — the system share sheet appears (AirDrop,
  Mail, Messages, WhatsApp, etc.).
- **Hosted web / PWA**: the Web Share API (`navigator.share({ files })`) opens
  the phone's share sheet on iOS/Android. On browsers without file sharing
  (most desktop setups), the button falls back to a plain PDF download.

The same PDF is produced on every path (identical input → identical file), so
"Download PDF" and "Share PDF" never diverge.

## 8. Notes & known trade-offs

- Invoice IDs use a sortable, collision-resistant format such as
  `INV-20260809-K7M4Q2PX9R5T`. They are still generated client-side; use a shared database with
  a unique constraint if you need guaranteed uniqueness, durable records, or legal sequential
  numbering across all users.
- Voice recognition requires HTTPS (or `localhost`) and browser support. Recognition quality,
  offline availability, and language support vary by browser/device; always review autofilled fields.
- No data is persisted anywhere (no database, no `localStorage`) — refreshing the page clears
  the form by design; use "Export JSON" to save a copy of an invoice before navigating away.
