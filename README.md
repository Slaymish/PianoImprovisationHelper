# Piano Improvisation Helper

A small React app that helps you improvise on piano by:

1) finding a song (manual search for now, recognition stub wired), then
2) **auto-detecting the key** from an audio preview clip (when available), and
3) displaying improv-friendly info (key + confidence, alternate guess, chord suggestions).

This repo is built with React + TypeScript + Vite and is configured for **Netlify hosting** (including serverless functions).

## What works today

- Manual song search via MusicBrainz
- Preview lookup via the iTunes Search API (best-effort)
- Key detection in-browser using Web Audio + a pitch-class histogram + Krumhansl–Schmuckler profiles
- Shows key + confidence and an alternate guess
- “Try again” and “Analyze longer” controls
- Netlify Function stub endpoint wired to the “Listening” screen

## How key detection works (high level)

1. We look for a CORS-accessible `previewUrl` (currently via iTunes).
2. We decode audio in the browser using the Web Audio API.
3. We compute a pitch-class histogram (12 bins) over multiple frames.
4. We correlate that histogram against major/minor key profiles and return the best match + ranked candidates.

## Local development

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Lint:

```bash
npm run lint
```

Build:

```bash
npm run build
```

## Netlify deployment

This repo includes `netlify.toml`:

- build command: `npm run build`
- publish directory: `dist`
- functions directory: `netlify/functions`
- SPA redirect: `/* -> /index.html`

### Serverless functions

- `/.netlify/functions/recognize` is a stub endpoint in `netlify/functions/recognize.ts`.

It currently returns a message and an empty match list. Later it will accept an audio snippet and call a real recognition provider.

## Known limitations (important)

- **Key detection requires a preview clip.** Not every song will have an iTunes preview available.
- **CORS matters.** Even if a preview exists, the browser must be allowed to fetch it.
- **Major/minor ambiguity** is common (relative keys). The UI shows an alternate guess to help.
- “Listen for song” recognition is currently a stub (backend wiring is in place).

## Roadmap

- Replace recognition stub with real audio capture + a recognition provider (Netlify Function)
- Improve chord suggestions based on detected key
- Add persistence (remember last song + results)
- Add UI polish (mobile-first, better layout, loading indicators)

