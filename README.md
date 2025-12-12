# Piano Improvisation Helper

A small React app to help with piano improv:

1) pick a song (manual search works well),
2) **detect the key** from an audio preview clip (when available),
3) show a couple of “useful right now” hints (key + confidence + an alternate guess).

It’s built with React + TypeScript + Vite, and it’s set up to deploy on **Netlify** (including a Functions folder for backend work later).

## What works today

- Manual song search via MusicBrainz
- Preview lookup via the iTunes Search API (when it can find one)
- Key detection in-browser using Web Audio + a pitch-class histogram + Krumhansl–Schmuckler profiles
- Shows key + confidence and an alternate guess
- “Try again” and “Analyze longer” controls
- A placeholder Netlify Function endpoint wired to the “Listening” screen

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

- `/.netlify/functions/recognize` is a placeholder endpoint in `netlify/functions/recognize.ts`.

Right now it just returns a message and an empty match list. The idea is to eventually send an audio snippet up and call a recognition provider.

## Known limitations (important)

- **Key detection needs a preview clip.** Not every song has an iTunes preview.
- **CORS matters.** Even if a preview exists, the browser still has to be allowed to fetch it.
- **Major/minor ambiguity** is common (relative keys). The UI shows an alternate guess to help.
- “Listen for song” recognition isn’t implemented yet (the wiring is there).

## Roadmap

- [ ] Replace the placeholder recognition call with real audio capture + a recognition provider (Netlify Function)
- [x] Improve chord suggestions based on detected key
- [x] Add persistence (remember last song + results)
- [ ] Add UI polish (mobile-first, better layout, loading indicators)

